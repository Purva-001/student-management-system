import { useState } from 'react';

function SearchStudent({ onSearch, onResult }) {
  const [searchTerm, setSearchTerm] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (searchTerm.trim()) {
      onSearch(searchTerm);
    }
  };

  return (
    <div className="card">
      <h2 style={{ marginBottom: '20px' }}>Search Student</h2>
      <form onSubmit={handleSubmit}>
        <div className="search-bar">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Enter Student ID or Name..."
          />
          <button type="submit" className="btn btn-primary">
            Search
          </button>
        </div>
      </form>
      <p style={{ marginTop: '15px', color: '#666', fontSize: '0.9rem' }}>
        Search by Student ID (e.g., STU001) or Full Name (e.g., John Doe)
      </p>
    </div>
  );
}

export default SearchStudent;
