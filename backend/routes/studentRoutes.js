const express = require('express');
const router = express.Router();
const {
  getAllStudents,
  getStudent,
  createStudent,
  updateStudent,
  deleteStudent
} = require('../controllers/studentController');

router.route('/').get(getAllStudents).post(createStudent);
router.route('/:searchTerm').get(getStudent);
router.route('/:id').put(updateStudent).delete(deleteStudent);

module.exports = router;
