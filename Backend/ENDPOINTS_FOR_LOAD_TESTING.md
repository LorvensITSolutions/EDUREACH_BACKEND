# API Endpoints for Load Testing

Base URL: `http://localhost:5000` or your production URL

## Authentication (`/api/auth`)

| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| POST | `/api/auth/signup` | No | User signup |
| POST | `/api/auth/login` | No | User login |
| POST | `/api/auth/logout` | No | User logout |
| POST | `/api/auth/refresh-token` | No | Refresh access token |
| GET | `/api/auth/profile` | Yes | Get user profile |
| POST | `/api/auth/change-password` | Yes | Change password |
| POST | `/api/auth/forgot-password` | No | Request password reset |
| POST | `/api/auth/reset-password/:token` | No | Reset password with token |

## Two-Factor Authentication (`/api/auth/2fa`)

| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| POST | `/api/auth/2fa/generate` | Yes | Generate 2FA QR code |
| POST | `/api/auth/2fa/verify-setup` | Yes | Verify 2FA setup |
| POST | `/api/auth/2fa/verify` | No | Verify 2FA code (login) |
| POST | `/api/auth/2fa/disable` | Yes | Disable 2FA |
| GET | `/api/auth/2fa/status` | Yes | Get 2FA status |

## Email 2FA (`/api/auth/email-2fa`)

| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| POST | `/api/auth/email-2fa/send` | No | Send email 2FA code |
| POST | `/api/auth/email-2fa/verify` | No | Verify email 2FA code |
| POST | `/api/auth/email-2fa/enable` | Yes | Enable email 2FA |
| POST | `/api/auth/email-2fa/disable` | Yes | Disable email 2FA |
| GET | `/api/auth/email-2fa/status` | Yes | Get email 2FA status |

## SMS 2FA (`/api/auth/sms-2fa`)

| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| POST | `/api/auth/sms-2fa/send` | No | Send SMS 2FA code |
| POST | `/api/auth/sms-2fa/verify` | No | Verify SMS 2FA code |
| POST | `/api/auth/sms-2fa/enable` | Yes | Enable SMS 2FA |
| POST | `/api/auth/sms-2fa/disable` | Yes | Disable SMS 2FA |
| GET | `/api/auth/sms-2fa/status` | Yes | Get SMS 2FA status |
| PUT | `/api/auth/sms-2fa/phone` | Yes | Update phone number |

## Device Trust (`/api/auth/device-trust`)

| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| POST | `/api/auth/device-trust/check` | No | Check device trust |
| POST | `/api/auth/device-trust/create` | Yes | Create trusted device |
| GET | `/api/auth/device-trust/devices` | Yes | Get trusted devices |
| DELETE | `/api/auth/device-trust/devices/:deviceId` | Yes | Revoke device |
| DELETE | `/api/auth/device-trust/devices` | Yes | Revoke all devices |

## Password Reset (`/api/password-reset`)

| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| POST | `/api/password-reset/request` | No | Request password reset |
| POST | `/api/password-reset/validate-token` | No | Validate reset token |
| POST | `/api/password-reset/reset` | No | Reset password |
| POST | `/api/password-reset/admin-reset` | Yes (Admin) | Admin reset password |

## Students (`/api/students`)

| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| POST | `/api/students/upload` | Yes (Admin) | Bulk upload students (Excel + ZIP) |
| POST | `/api/students/create-single` | Yes (Admin) | Create single student |
| POST | `/api/students/update-images` | Yes (Admin) | Update student images from ZIP |
| GET | `/api/students/my-students` | Yes | Get my students (teacher/admin) |
| GET | `/api/students/all` | Yes (Admin) | Get all students |
| GET | `/api/students/all-for-credentials` | Yes (Admin) | Get all students for credentials |
| GET | `/api/students/unique-values` | No | Get unique classes/sections |
| GET | `/api/students/count-students` | No | Count total students |
| GET | `/api/students/by-parent` | Yes | Get student info by parent |
| GET | `/api/students/profile/:studentId` | Yes | Get student profile |
| GET | `/api/students/admin-profile/:studentId` | Yes (Admin) | Get detailed student profile |
| PUT | `/api/students/update-image/:studentId` | Yes (Admin) | Update student image |
| DELETE | `/api/students/:studentId` | Yes (Admin) | Delete student |

## Teachers (`/api/teachers`)

| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| POST | `/api/teachers/assign-section` | Yes (Admin) | Assign section to teacher |
| POST | `/api/teachers/upload-bulk` | Yes (Admin) | Bulk upload teachers (Excel + ZIP) |
| POST | `/api/teachers/create` | Yes (Admin) | Create single teacher |
| POST | `/api/teachers/update-images` | Yes (Admin) | Update teacher images from ZIP |
| GET | `/api/teachers/` | Yes (Admin) | Get teachers |
| GET | `/api/teachers/all` | Yes (Admin) | Get all teachers |
| GET | `/api/teachers/students` | Yes (Teacher) | Get assigned students with attendance |
| GET | `/api/teachers/class-teachers` | Yes (Student/Parent) | Get class teachers |
| GET | `/api/teachers/by-parent` | Yes (Parent) | Get student by parent |
| GET | `/api/teachers/admin-profile/:teacherId` | Yes (Admin) | Get detailed teacher profile |
| PUT | `/api/teachers/update-image/:teacherId` | Yes (Admin) | Update teacher image |
| DELETE | `/api/teachers/:teacherId` | Yes (Admin) | Delete teacher |

## Parents (`/api/parents`)

| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| GET | `/api/parents/` | Yes (Admin) | Get all parents |
| GET | `/api/parents/count` | Yes (Admin) | Count parents |
| GET | `/api/parents/:parentId` | Yes (Admin) | Get parent with children |
| POST | `/api/parents/create-with-children` | Yes (Admin) | Create parent with children |
| POST | `/api/parents/:parentId/add-child` | Yes (Admin) | Add child to parent |

## Attendance (`/api/attendance`)

| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| POST | `/api/attendance/mark` | Yes (Teacher) | Mark attendance |
| GET | `/api/attendance/summary` | Yes | Get monthly attendance summary |
| GET | `/api/attendance/daily-summary` | Yes (Teacher) | Get daily attendance summary |
| GET | `/api/attendance/students-attendance` | Yes (Student) | Get student attendance |
| GET | `/api/attendance/parent/student-attendance` | Yes (Parent) | Get attendance for parent |

## Teacher Attendance (`/api/teacher-attendance`)

| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| POST | `/api/teacher-attendance/admin/mark` | Yes (Admin) | Mark teacher attendance |
| GET | `/api/teacher-attendance/admin/all` | Yes (Admin) | Get all teachers' attendance |
| PUT | `/api/teacher-attendance/admin/update/:attendanceId` | Yes (Admin) | Update teacher attendance |
| DELETE | `/api/teacher-attendance/admin/delete/:attendanceId` | Yes (Admin) | Delete teacher attendance |
| GET | `/api/teacher-attendance/admin/without-attendance` | Yes (Admin) | Get teachers without attendance |
| GET | `/api/teacher-attendance/admin/monthly-report` | Yes (Admin) | Get monthly attendance report |
| GET | `/api/teacher-attendance/admin/daily-summary` | Yes (Admin) | Get daily summary |
| GET | `/api/teacher-attendance/admin/summary` | Yes (Admin) | Get attendance summary |
| GET | `/api/teacher-attendance/admin/statistics` | Yes (Admin) | Get attendance statistics |
| GET | `/api/teacher-attendance/teacher/history` | Yes (Teacher) | Get teacher's attendance history |
| GET | `/api/teacher-attendance/teacher/summary` | Yes (Teacher) | Get teacher's attendance summary |
| GET | `/api/teacher-attendance/teacher/today` | Yes (Teacher) | Get today's attendance status |
| GET | `/api/teacher-attendance/statistics` | Yes | Get attendance statistics |

## Payments (`/api/payment`)

| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| POST | `/api/payment/create-order` | Yes | Create payment order |
| POST | `/api/payment/create-fee-structure` | Yes (Admin) | Create fee structure |
| GET | `/api/payment/fee-structure` | Yes (Parent) | Get fee structure for children |
| POST | `/api/payment/verify` | Yes | Verify payment |
| GET | `/api/payment/my-payments` | Yes (Parent) | Get my payments |
| GET | `/api/payment/all` | Yes (Admin) | Get all fee structures |
| PUT | `/api/payment/:id` | Yes (Admin) | Update fee structure |
| DELETE | `/api/payment/:id` | Yes (Admin) | Delete fee structure |
| GET | `/api/payment/fee-defaulters` | Yes (Admin) | Get fee defaulters |
| POST | `/api/payment/send-reminder/:studentId` | Yes (Admin) | Send fee reminder |
| POST | `/api/payment/custom-fee` | Yes (Admin) | Create/update custom fee |
| POST | `/api/payment/verify-offline/:paymentId` | Yes (Admin) | Verify offline payment |
| GET | `/api/payment/pending-offline` | Yes (Admin) | Get pending offline payments |
| POST | `/api/payment/generate-receipt/:paymentId` | Yes | Generate payment receipt |
| GET | `/api/payment/receipt/:paymentId` | Yes | Download receipt |
| GET | `/api/payment/test-whatsapp` | No | Test WhatsApp (manual) |

## Assignments (`/api/assignments`)

| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| POST | `/api/assignments/upload` | Yes (Teacher) | Upload assignment |
| PATCH | `/api/assignments/:id/update-due-date` | Yes (Teacher) | Update assignment due date |
| POST | `/api/assignments/evaluate` | Yes (Teacher) | Evaluate assignment |
| GET | `/api/assignments/teacher` | Yes (Teacher) | Get teacher's assignments |
| DELETE | `/api/assignments/:id` | Yes (Teacher) | Delete assignment |
| GET | `/api/assignments/parent/student` | Yes (Parent) | Get child assignments |
| GET | `/api/assignments/student` | Yes (Student) | Get student assignments |
| GET | `/api/assignments/:id` | Yes (Student) | Get single assignment |
| POST | `/api/assignments/submit/:assignmentId` | Yes (Student) | Submit assignment |
| GET | `/api/assignments/:id/submissions` | Yes (Teacher) | Get assignment submissions |

## Admissions (`/api/admissions`)

| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| POST | `/api/admissions/` | No | Create application |
| GET | `/api/admissions/` | Yes (Admin) | Get all applications |
| GET | `/api/admissions/:id` | Yes (Admin) | Get application by ID |
| PUT | `/api/admissions/:id/review` | Yes (Admin) | Review application |

## Dashboard (`/api/dashboard`)

| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| GET | `/api/dashboard/analytics` | Yes (Admin) | Get dashboard analytics |
| GET | `/api/dashboard/income-expense` | Yes (Admin) | Get income/expense data |
| GET | `/api/dashboard/attendance-inspection` | Yes (Admin) | Get attendance inspection data |
| GET | `/api/dashboard/annual-fee-summary` | Yes (Admin) | Get annual fee summary |

## Enhanced Analytics (`/api/enhanced-analytics`)

| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| GET | `/api/enhanced-analytics/comprehensive` | Yes (Admin) | Get comprehensive analytics |
| GET | `/api/enhanced-analytics/real-time` | Yes (Admin) | Get real-time updates |
| GET | `/api/enhanced-analytics/income-expense` | Yes (Admin) | Get income/expense data |
| GET | `/api/enhanced-analytics/fee-collection-status` | Yes (Admin) | Get fee collection status |
| GET | `/api/enhanced-analytics/payment-methods` | Yes (Admin) | Get payment methods analysis |
| GET | `/api/enhanced-analytics/attendance-inspection` | Yes (Admin) | Get attendance inspection |
| GET | `/api/enhanced-analytics/annual-fee-summary` | Yes (Admin) | Get annual fee summary |
| GET | `/api/enhanced-analytics/teacher-performance` | Yes (Admin) | Get teacher performance |
| GET | `/api/enhanced-analytics/real-time-alerts` | Yes (Admin) | Get real-time alerts |
| GET | `/api/enhanced-analytics/performance-trends` | Yes (Admin) | Get performance trends |
| GET | `/api/enhanced-analytics/student-attendance` | Yes (Admin) | Get student attendance analytics |
| GET | `/api/enhanced-analytics/teacher-attendance` | Yes (Admin) | Get teacher attendance analytics |
| GET | `/api/enhanced-analytics/attendance-comparative` | Yes (Admin) | Get comparative attendance |
| POST | `/api/enhanced-analytics/invalidate-cache` | Yes (Admin) | Invalidate analytics cache |

## Analytics (`/api/analytics`)

| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| GET | `/api/analytics/students-by-class` | No | Get students by class |
| GET | `/api/analytics/students-by-section` | No | Get students by section |
| GET | `/api/analytics/admission-trends` | No | Get admission trends |
| GET | `/api/analytics/attendance-patterns` | No | Get attendance patterns |
| GET | `/api/analytics/attendance-summary` | No | Get attendance summary |
| GET | `/api/analytics/fee-collection-rates` | No | Get fee collection rates |
| GET | `/api/analytics/outstanding-payments` | No | Get outstanding payments |
| GET | `/api/analytics/payment-methods-analysis` | No | Get payment methods analysis |
| GET | `/api/analytics/fee-structure-by-class` | No | Get fee structure by class |
| GET | `/api/analytics/late-fee-analytics` | No | Get late fee analytics |
| GET | `/api/analytics/assignment-completion-rates` | No | Get assignment completion rates |
| GET | `/api/analytics/teacher-workload` | No | Get teacher workload |
| GET | `/api/analytics/active-students-count` | No | Get active students count |
| GET | `/api/analytics/pending-admissions-count` | No | Get pending admissions count |
| GET | `/api/analytics/upcoming-events` | No | Get upcoming events |
| GET | `/api/analytics/dashboard-summary` | No | Get dashboard summary |
| GET | `/api/analytics/teacher-dashboard` | Yes (Teacher) | Get teacher analytics dashboard |

## Events (`/api/events`)

| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| POST | `/api/events/` | Yes (Admin) | Create event |
| GET | `/api/events/` | No | Get events |
| PATCH | `/api/events/:id/rsvp` | Yes | Toggle RSVP |
| DELETE | `/api/events/:id` | Yes (Admin) | Delete event |

## Leave Applications (`/api/leaves`)

| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| GET | `/api/leaves/children` | Yes (Parent) | Get parent's children |
| POST | `/api/leaves/apply` | Yes (Parent) | Apply for leave |
| GET | `/api/leaves/my-leaves` | Yes (Parent) | Get my leaves |
| GET | `/api/leaves/all` | Yes (Teacher) | Get all leave applications |
| GET | `/api/leaves/my-students` | Yes (Teacher) | Get teacher's students' leaves |
| PATCH | `/api/leaves/update-status/:leaveId` | Yes (Teacher) | Update leave status |

## Library (`/api/library`)

| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| POST | `/api/library/bulk-upload` | Yes (Librarian) | Bulk upload books |
| PUT | `/api/library/book/:id` | Yes (Librarian) | Update book |
| DELETE | `/api/library/book/:id` | Yes (Librarian) | Delete book |
| GET | `/api/library/books` | Yes | Get all books |
| POST | `/api/library/return` | Yes | Return book |
| POST | `/api/library/request-book` | Yes | Request book |
| POST | `/api/library/approve-request` | Yes (Librarian) | Approve book request |
| GET | `/api/library/pending-requests` | Yes (Librarian) | Get pending requests |
| GET | `/api/library/my-issued-books` | Yes | Get my issued books |
| GET | `/api/library/my-requests` | Yes (Student/Teacher) | Get my requests |

## Librarians (`/api/librarians`)

| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| POST | `/api/librarians/create-librarian` | Yes (Admin) | Create librarian |
| GET | `/api/librarians/all` | Yes (Admin) | Get all librarians |
| DELETE | `/api/librarians/:id` | Yes (Admin) | Delete librarian |

## Settings (`/api/settings`)

| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| POST | `/api/settings/late-fee` | Yes (Admin) | Update late fee |
| GET | `/api/settings/` | Yes (Admin) | Get all settings |
| POST | `/api/settings/reminder-time` | Yes (Admin) | Update reminder time |
| POST | `/api/settings/reminder-days` | Yes (Admin) | Update reminder days |

## School (`/api/school`)

| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| GET | `/api/school/` | Yes (Admin) | Get school configuration |
| PUT | `/api/school/` | Yes (Admin) | Update school configuration |
| POST | `/api/school/reset-counter` | Yes (Admin) | Reset student counter |

## Projects (`/api/projects`)

| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| POST | `/api/projects/` | Yes (Admin) | Create project |
| DELETE | `/api/projects/:id` | Yes (Admin) | Delete project |
| PATCH | `/api/projects/:id` | Yes (Admin) | Update project |
| GET | `/api/projects/` | No | Get all projects |

## Announcements (`/api/announcements`)

| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| POST | `/api/announcements/` | Yes (Admin) | Create announcement |
| GET | `/api/announcements/` | No | Get announcements |
| PATCH | `/api/announcements/:id/pin` | Yes (Admin) | Toggle pin |
| DELETE | `/api/announcements/:id` | Yes (Admin) | Delete announcement |

## Calendar (`/api/calendar`)

| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| POST | `/api/calendar/create` | No | Create calendar event |
| GET | `/api/calendar/list` | No | List calendar events |
| PUT | `/api/calendar/events/:eventId` | No | Update event |
| DELETE | `/api/calendar/events/:eventId` | No | Delete event |

## Chatbot (`/api/chatbot`)

| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| POST | `/api/chatbot/` | Yes (Admin) | Admin chatbot handler |

## Timetable (`/api/timetable`)

| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| POST | `/api/timetable/validate` | No | Validate timetable input |
| POST | `/api/timetable/generate` | No | Generate timetable |
| GET | `/api/timetable/progress/:jobId` | No | Get generation progress |
| GET | `/api/timetable/all` | No | Get all timetables |
| DELETE | `/api/timetable/:id` | No | Delete timetable |
| GET | `/api/timetable/` | No | Get teachers (name + subject) |
| GET | `/api/timetable/teacher/:teacherName` | No | Get teacher timetable |
| GET | `/api/timetable/my-timetable` | Yes (Teacher) | Get my timetable |
| GET | `/api/timetable/students-timetable` | Yes (Student) | Get student timetable |
| POST | `/api/timetable/import/classes` | No | Import classes from file |
| POST | `/api/timetable/import/teachers` | No | Import teachers from file |
| POST | `/api/timetable/import/full` | No | Import full timetable config |
| GET | `/api/timetable/auto-fill/teachers` | No | Auto-fill teachers |
| GET | `/api/timetable/auto-fill/subjects` | No | Auto-fill subjects |
| GET | `/api/timetable/auto-fill/classes` | No | Auto-fill classes |
| POST | `/api/timetable/templates` | Yes | Save template |
| GET | `/api/timetable/templates` | Yes | Get all templates |
| GET | `/api/timetable/templates/:id` | Yes | Get specific template |
| DELETE | `/api/timetable/templates/:id` | Yes | Delete template |
| PATCH | `/api/timetable/:id/slot` | Yes | Update single slot |
| POST | `/api/timetable/:id/swap` | Yes | Swap two slots |
| GET | `/api/timetable/:id/export/pdf` | No | Export to PDF |
| GET | `/api/timetable/:id/export/excel` | No | Export to Excel |
| GET | `/api/timetable/:id/export/json` | No | Export to JSON |
| POST | `/api/timetable/save-class-subjects` | No | Save class subjects |

## Subjects (`/api/subjects`)

| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| POST | `/api/subjects/` | No | Add new subject |
| GET | `/api/subjects/` | No | Get all subjects |
| PUT | `/api/subjects/:id` | No | Update subject |
| DELETE | `/api/subjects/:id` | No | Delete subject |

## Exam Seating (`/api/exam-seating`)

| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| POST | `/api/exam-seating/generate` | Yes | Generate exam seating |
| GET | `/api/exam-seating/all` | Yes | Get all exam seating arrangements |
| GET | `/api/exam-seating/:id` | Yes | Get specific exam seating |
| DELETE | `/api/exam-seating/:id` | Yes | Delete exam seating |
| GET | `/api/exam-seating/auto-fill/students` | Yes | Get students count for classes |
| GET | `/api/exam-seating/auto-fill/teachers` | Yes | Get available teachers count |
| GET | `/api/exam-seating/auto-fill/classes` | Yes | Get available classes |

## Upload (`/api/upload`)

Note: Check `upload.route.js` for specific upload endpoints if they exist separately.

---

## Load Testing Recommendations

### High Priority Endpoints (Test First)
1. **Authentication**: `/api/auth/login`, `/api/auth/signup`
2. **Student Management**: `/api/students/all`, `/api/students/my-students`
3. **Attendance**: `/api/attendance/mark`, `/api/attendance/summary`
4. **Payments**: `/api/payment/create-order`, `/api/payment/verify`
5. **Dashboard**: `/api/dashboard/analytics`

### Medium Priority Endpoints
1. **Assignments**: `/api/assignments/upload`, `/api/assignments/student`
2. **Events**: `/api/events/`
3. **Announcements**: `/api/announcements/`
4. **Analytics**: `/api/analytics/*`

### Low Priority Endpoints (Test Last)
1. **Timetable Generation**: `/api/timetable/generate` (CPU intensive)
2. **Bulk Uploads**: `/api/students/upload`, `/api/teachers/upload-bulk`
3. **Export Functions**: PDF/Excel exports

### Test Scenarios

1. **Concurrent Login**: 100-500 users logging in simultaneously
2. **Attendance Marking**: 50-200 teachers marking attendance concurrently
3. **Payment Processing**: 100-300 payment orders created simultaneously
4. **Dashboard Load**: 50-100 admins accessing dashboard analytics
5. **File Upload**: 10-50 concurrent file uploads (assignments, student images)

### Authentication Notes
- Most endpoints require authentication (JWT token in cookies or Authorization header)
- Some endpoints require specific roles (Admin, Teacher, Student, Parent, Librarian)
- Use `protectRoute` middleware for authenticated endpoints
- Use role-specific middleware (`adminRoute`, `teacherRoute`, etc.) for role-based access

### Rate Limiting Recommendations
- Authentication endpoints: 10 requests/minute per IP
- File upload endpoints: 5 requests/minute per user
- Analytics endpoints: 20 requests/minute per user
- General API endpoints: 100 requests/minute per user

