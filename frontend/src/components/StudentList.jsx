import { useState } from 'react';
import StudentForm from './StudentForm';

function StudentList({ students, loading, onUpdate, onDelete, onRefresh }) {
  const [editingStudent, setEditingStudent] = useState(null);

  const handleEdit = (student) => {
    setEditingStudent(student);
  };

  const handleUpdate = (studentData) => {
    onUpdate(editingStudent._id, studentData);
    setEditingStudent(null);
  };

  const handleCancelEdit = () => {
    setEditingStudent(null);
  };

  if (loading) {
    return <div className="loading">Loading students...</div>;
  }

  if (editingStudent) {
    return (
      <StudentForm
        initialData={editingStudent}
        onSubmit={handleUpdate}
        onCancel={handleCancelEdit}
      />
    );
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2>Student List</h2>
        <button className="btn btn-secondary" onClick={onRefresh}>
          Refresh
        </button>
      </div>

      {students.length === 0 ? (
        <div className="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
            <circle cx="9" cy="7" r="4"></circle>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
          </svg>
          <p>No students found. Add your first student!</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="student-table">
            <thead>
              <tr>
                <th>Student ID</th>
                <th>Name</th>
                <th>Email</th>
                <th>Department</th>
                <th>Semester</th>
                <th>Contact</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {students.map((student) => (
                <tr key={student._id}>
                  <td>{student.studentId}</td>
                  <td>{student.fullName}</td>
                  <td>{student.email}</td>
                  <td>{student.department}</td>
                  <td>Semester {student.semester}</td>
                  <td>{student.contactNumber}</td>
                  <td>
                    <div className="actions">
                      <button
                        className="btn btn-success"
                        onClick={() => handleEdit(student)}
                      >
                        Edit
                      </button>
                      <button
                        className="btn btn-danger"
                        onClick={() => onDelete(student._id)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default StudentList;
