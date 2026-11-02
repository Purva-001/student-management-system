/**
 * mcpServer.js — MCP Server factory with all 5 student management tools
 *
 * Tools implemented:
 *   1. get_students     — GET  /api/students
 *   2. search_student   — GET  /api/students/:searchTerm
 *   3. add_student      — POST /api/students
 *   4. update_student   — PUT  /api/students/:id
 *   5. delete_student   — DELETE /api/students/:id  (requires confirm: true)
 *
 * All operations proxy through the existing backend REST API.
 * This server never connects to MongoDB directly.
 */

'use strict';

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { z } = require('zod');
const apiClient = require('./apiClient.js');

/**
 * Creates and returns a configured McpServer instance.
 * Called once per incoming MCP HTTP request (stateless per-request pattern).
 */
function createMcpServer() {
  const server = new McpServer({
    name: 'student-management-mcp',
    version: '1.0.0'
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Tool 1: get_students
  // ─────────────────────────────────────────────────────────────────────────────
  server.tool(
    'get_students',
    'Retrieve all student records from the Student Management System. Returns a list of all students with their full details.',
    {}, // No input parameters needed
    async () => {
      try {
        const response = await apiClient.get('/api/students');
        const { success, count, data } = response.data;

        if (!success) {
          return toolError('Failed to retrieve students from the backend.');
        }

        if (!data || data.length === 0) {
          return toolText('No students found in the system.');
        }

        const formatted = data.map(formatStudent).join('\n\n');
        return toolText(`Found ${count} student(s):\n\n${formatted}`);
      } catch (error) {
        return toolError(`Error retrieving students: ${safeMessage(error)}`);
      }
    }
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // Tool 2: search_student
  // ─────────────────────────────────────────────────────────────────────────────
  server.tool(
    'search_student',
    'Search for a student by their Student ID or full name. Returns matching student details.',
    {
      search_term: z
        .string()
        .min(1, 'Search term cannot be empty')
        .describe('Student ID (e.g. "STU001") or full name (e.g. "John Doe") to search for')
    },
    async ({ search_term }) => {
      try {
        const encoded = encodeURIComponent(search_term.trim());
        const response = await apiClient.get(`/api/students/${encoded}`);
        const { success, data } = response.data;

        if (!success || !data) {
          return toolText(`No student found matching "${search_term}".`);
        }

        return toolText(`Student found:\n\n${formatStudent(data)}`);
      } catch (error) {
        if (error.statusCode === 404) {
          return toolText(`No student found matching "${search_term}".`);
        }
        return toolError(`Error searching for student: ${safeMessage(error)}`);
      }
    }
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // Tool 3: add_student
  // ─────────────────────────────────────────────────────────────────────────────
  server.tool(
    'add_student',
    'Add a new student record to the Student Management System. All fields are required.',
    {
      studentId: z
        .string()
        .min(1, 'Student ID is required')
        .describe('Unique student identifier (e.g. "STU001")'),
      fullName: z
        .string()
        .min(1, 'Full name is required')
        .describe('Student\'s full name'),
      email: z
        .string()
        .email('Must be a valid email address')
        .describe('Student\'s email address (must be unique)'),
      department: z
        .string()
        .min(1, 'Department is required')
        .describe('Academic department (e.g. "Computer Science")'),
      semester: z
        .string()
        .min(1, 'Semester is required')
        .describe('Current semester (e.g. "3rd", "Fall 2024")'),
      contactNumber: z
        .string()
        .min(1, 'Contact number is required')
        .describe('Student\'s contact/phone number')
    },
    async ({ studentId, fullName, email, department, semester, contactNumber }) => {
      try {
        const response = await apiClient.post('/api/students', {
          studentId: studentId.trim(),
          fullName: fullName.trim(),
          email: email.trim().toLowerCase(),
          department: department.trim(),
          semester: semester.trim(),
          contactNumber: contactNumber.trim()
        });

        const { success, message, data } = response.data;

        if (!success) {
          return toolError(message || 'Failed to create student.');
        }

        return toolText(`✅ ${message}\n\n${formatStudent(data)}`);
      } catch (error) {
        if (error.statusCode === 400) {
          return toolError(`Validation error: ${safeMessage(error)}`);
        }
        return toolError(`Error creating student: ${safeMessage(error)}`);
      }
    }
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // Tool 4: update_student
  // ─────────────────────────────────────────────────────────────────────────────
  server.tool(
    'update_student',
    'Update an existing student record. Provide the MongoDB document ID and the fields to update. At least one field must be provided.',
    {
      id: z
        .string()
        .min(1, 'Student document ID is required')
        .describe('MongoDB _id of the student document (use search_student or get_students to find it)'),
      fullName: z
        .string()
        .min(1)
        .optional()
        .describe('Updated full name'),
      email: z
        .string()
        .email('Must be a valid email address')
        .optional()
        .describe('Updated email address'),
      department: z
        .string()
        .min(1)
        .optional()
        .describe('Updated department'),
      semester: z
        .string()
        .min(1)
        .optional()
        .describe('Updated semester'),
      contactNumber: z
        .string()
        .min(1)
        .optional()
        .describe('Updated contact number')
    },
    async ({ id, fullName, email, department, semester, contactNumber }) => {
      // Ensure at least one field is being updated
      const updateFields = {};
      if (fullName !== undefined) updateFields.fullName = fullName.trim();
      if (email !== undefined) updateFields.email = email.trim().toLowerCase();
      if (department !== undefined) updateFields.department = department.trim();
      if (semester !== undefined) updateFields.semester = semester.trim();
      if (contactNumber !== undefined) updateFields.contactNumber = contactNumber.trim();

      if (Object.keys(updateFields).length === 0) {
        return toolError('No fields provided to update. Supply at least one of: fullName, email, department, semester, contactNumber.');
      }

      try {
        const response = await apiClient.put(`/api/students/${id}`, updateFields);
        const { success, message, data } = response.data;

        if (!success) {
          return toolError(message || 'Failed to update student.');
        }

        return toolText(`✅ ${message}\n\n${formatStudent(data)}`);
      } catch (error) {
        if (error.statusCode === 404) {
          return toolError(`Student with ID "${id}" not found. Use get_students or search_student to find the correct _id.`);
        }
        if (error.statusCode === 400) {
          return toolError(`Validation error: ${safeMessage(error)}`);
        }
        return toolError(`Error updating student: ${safeMessage(error)}`);
      }
    }
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // Tool 5: delete_student
  // ─────────────────────────────────────────────────────────────────────────────
  server.tool(
    'delete_student',
    'Delete a student record permanently. This action is irreversible. You MUST set confirm=true to proceed.',
    {
      id: z
        .string()
        .min(1, 'Student document ID is required')
        .describe('MongoDB _id of the student to delete'),
      confirm: z
        .boolean()
        .describe('Must be explicitly set to true to confirm the deletion. Set false or omit to get a confirmation prompt instead.')
    },
    async ({ id, confirm }) => {
      if (!confirm) {
        return toolText(
          `⚠️  Delete confirmation required.\n\n` +
          `You are about to permanently delete the student with ID: "${id}"\n\n` +
          `This action cannot be undone. To proceed, call delete_student again with confirm=true.`
        );
      }

      try {
        const response = await apiClient.delete(`/api/students/${id}`);
        const { success, message } = response.data;

        if (!success) {
          return toolError(message || 'Failed to delete student.');
        }

        return toolText(`✅ ${message}\n\nStudent with document ID "${id}" has been permanently removed.`);
      } catch (error) {
        if (error.statusCode === 404) {
          return toolError(`Student with ID "${id}" not found. Use get_students or search_student to find the correct _id.`);
        }
        return toolError(`Error deleting student: ${safeMessage(error)}`);
      }
    }
  );

  return server;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Formats a student document as a human-readable string.
 * Never exposes internal MongoDB implementation details.
 */
function formatStudent(student) {
  return [
    `• Document ID  : ${student._id}`,
    `  Student ID   : ${student.studentId}`,
    `  Full Name    : ${student.fullName}`,
    `  Email        : ${student.email}`,
    `  Department   : ${student.department}`,
    `  Semester     : ${student.semester}`,
    `  Contact      : ${student.contactNumber}`,
    `  Created      : ${student.createdAt ? new Date(student.createdAt).toLocaleString() : 'N/A'}`,
    `  Last Updated : ${student.updatedAt ? new Date(student.updatedAt).toLocaleString() : 'N/A'}`
  ].join('\n');
}

/**
 * Returns a safe error message — never exposes stack traces or connection strings.
 */
function safeMessage(error) {
  return error.message || 'An unexpected error occurred.';
}

/**
 * Returns an MCP tool success response with plain text content.
 */
function toolText(text) {
  return { content: [{ type: 'text', text }] };
}

/**
 * Returns an MCP tool error response (isError=true tells the MCP client this is a failure).
 */
function toolError(text) {
  return { content: [{ type: 'text', text }], isError: true };
}

module.exports = { createMcpServer };
