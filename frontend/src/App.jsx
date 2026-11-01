import { useState, useEffect } from 'react';
import { studentAPI } from './services/api';
import StudentForm from './components/StudentForm';
import StudentList from './components/StudentList';
import SearchStudent from './components/SearchStudent';
import './index.css';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState(null);
  const [healthStatus, setHealthStatus] = useState(null);

  useEffect(() => {
    fetchStudents();
    checkHealth();
  }, []);

  const checkHealth = async () => {
    try {
      const response = await studentAPI.healthCheck();
      setHealthStatus(response);
    } catch (error) {
      console.error('Health check failed:', error);
      setHealthStatus({ success: false, message: 'Backend not connected' });
    }
  };

  const fetchStudents = async () => {
    setLoading(true);
    try {
      const response = await studentAPI.getAllStudents();
      setStudents(response.data || []);
    } catch (error) {
      showNotification('Error fetching students', 'error');
    } finally {
      setLoading(false);
    }
  };

  const showNotification = (message, type) => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleAddStudent = async (studentData) => {
    try {
      await studentAPI.createStudent(studentData);
      showNotification('Student added successfully!', 'success');
      fetchStudents();
      setActiveTab('list');
    } catch (error) {
      showNotification(error.response?.data?.message || 'Error adding student', 'error');
    }
  };

  const handleUpdateStudent = async (id, studentData) => {
    try {
      await studentAPI.updateStudent(id, studentData);
      showNotification('Student updated successfully!', 'success');
      fetchStudents();
    } catch (error) {
      showNotification(error.response?.data?.message || 'Error updating student', 'error');
    }
  };

  const handleDeleteStudent = async (id) => {
    if (window.confirm('Are you sure you want to delete this student?')) {
      try {
        await studentAPI.deleteStudent(id);
        showNotification('Student deleted successfully!', 'success');
        fetchStudents();
      } catch (error) {
        showNotification(error.response?.data?.message || 'Error deleting student', 'error');
      }
    }
  };

  const handleSearch = async (searchTerm) => {
    setLoading(true);
    try {
      const response = await studentAPI.searchStudent(searchTerm);
      if (response.data) {
        setStudents([response.data]);
        showNotification('Student found!', 'success');
      } else {
        setStudents([]);
        showNotification('No student found', 'error');
      }
    } catch (error) {
      showNotification(error.response?.data?.message || 'Error searching student', 'error');
      setStudents([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <div className="header">
        <h1>Student Information Management System</h1>
        <p>Manage student records efficiently</p>
        {healthStatus && (
          <p style={{ fontSize: '0.9rem', marginTop: '10px' }}>
            Backend Status: {healthStatus.success ? '✓ Connected' : '✗ Disconnected'}
          </p>
        )}
      </div>

      {notification && (
        <div className={`notification ${notification.type}`}>
          {notification.message}
        </div>
      )}

      <div className="tabs">
        <button
          className={`tab ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          Dashboard
        </button>
        <button
          className={`tab ${activeTab === 'add' ? 'active' : ''}`}
          onClick={() => setActiveTab('add')}
        >
          Add Student
        </button>
        <button
          className={`tab ${activeTab === 'list' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('list');
            fetchStudents();
          }}
        >
          Student List
        </button>
        <button
          className={`tab ${activeTab === 'search' ? 'active' : ''}`}
          onClick={() => setActiveTab('search')}
        >
          Search Student
        </button>
      </div>

      {activeTab === 'dashboard' && (
        <div className="card">
          <h2 style={{ marginBottom: '20px' }}>Dashboard Overview</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
            <div style={{ padding: '20px', background: '#667eea', color: 'white', borderRadius: '8px' }}>
              <h3>Total Students</h3>
              <p style={{ fontSize: '2rem', fontWeight: 'bold' }}>{students.length}</p>
            </div>
            <div style={{ padding: '20px', background: '#27ae60', color: 'white', borderRadius: '8px' }}>
              <h3>System Status</h3>
              <p style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>
                {healthStatus?.success ? 'Online' : 'Offline'}
              </p>
            </div>
          </div>
          <button
            className="btn btn-primary"
            style={{ marginTop: '20px' }}
            onClick={() => {
              fetchStudents();
              setActiveTab('list');
            }}
          >
            View All Students
          </button>
        </div>
      )}

      {activeTab === 'add' && (
        <StudentForm onSubmit={handleAddStudent} onCancel={() => setActiveTab('dashboard')} />
      )}

      {activeTab === 'list' && (
        <StudentList
          students={students}
          loading={loading}
          onUpdate={handleUpdateStudent}
          onDelete={handleDeleteStudent}
          onRefresh={fetchStudents}
        />
      )}

      {activeTab === 'search' && (
        <SearchStudent onSearch={handleSearch} onResult={(student) => setStudents(student ? [student] : [])} />
      )}
    </div>
  );
}

export default App;
