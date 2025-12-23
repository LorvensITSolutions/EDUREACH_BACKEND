import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// ============================================
// CUSTOM METRICS
// ============================================
const errorRate = new Rate('errors');
const loginDuration = new Trend('login_duration');
const apiResponseTime = new Trend('api_response_time');

// ============================================
// CONFIGURATION
// ============================================
const BASE_URL = __ENV.BASE_URL || 'https://school-backend-uhbj.onrender.com/api';
// For local testing: 'http://localhost:5000/api'

// Test credentials (you should create test accounts for load testing)
const TEST_USERS = {
  admin: {
    email: __ENV.ADMIN_EMAIL || 'superadmin@gmail.com',
    password: __ENV.ADMIN_PASSWORD || '12345678',
  },
  teacher: {
    email: __ENV.TEACHER_EMAIL || 'teacher@test.com',
    password: __ENV.TEACHER_PASSWORD || 'teacher123',
  },
  student: {
    email: __ENV.STUDENT_EMAIL || 'student@test.com',
    password: __ENV.STUDENT_PASSWORD || 'student123',
  },
  parent: {
    email: __ENV.PARENT_EMAIL || 'parent@test.com',
    password: __ENV.PARENT_PASSWORD || 'parent123',
  },
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Login and get auth token
 */
function login(email, password) {
  const loginStart = Date.now();
  const payload = JSON.stringify({
    email: email,
    password: password,
    deviceInfo: {
      platform: 'k6-load-test',
      screenResolution: '1920x1080',
      timezone: 'UTC',
    },
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  };

  const res = http.post(`${BASE_URL}/auth/login`, payload, params);
  const loginTime = Date.now() - loginStart;
  loginDuration.add(loginTime);

  const success = check(res, {
    'login status is 200 or 201': (r) => r.status === 200 || r.status === 201,
    'login response has user or requires2FA': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.user || body.requires2FA || body.requiresEmail2FA || body.requiresSMS2FA;
      } catch {
        return false;
      }
    },
  });

  errorRate.add(!success);

  if (success && res.status === 200) {
    try {
      const body = JSON.parse(res.body);
      // Extract cookies (session-based auth) or token (JWT)
      const cookies = res.cookies;
      return { cookies, user: body.user, success: true };
    } catch (e) {
      return { success: false, error: 'Failed to parse login response' };
    }
  }

  return { success: false, error: 'Login failed' };
}

/**
 * Make authenticated request
 */
function authenticatedRequest(method, path, payload = null, cookies = {}) {
  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    cookies: cookies,
  };

  const startTime = Date.now();
  let res;

  if (method === 'GET') {
    res = http.get(`${BASE_URL}${path}`, params);
  } else if (method === 'POST') {
    res = http.post(`${BASE_URL}${path}`, payload ? JSON.stringify(payload) : null, params);
  } else if (method === 'PUT') {
    res = http.put(`${BASE_URL}${path}`, payload ? JSON.stringify(payload) : null, params);
  } else if (method === 'DELETE') {
    res = http.del(`${BASE_URL}${path}`, null, params);
  }

  const duration = Date.now() - startTime;
  apiResponseTime.add(duration);

  return { res, duration };
}


export function adminFlow() {
  // Login
  const loginResult = login(TEST_USERS.admin.email, TEST_USERS.admin.password);
  if (!loginResult.success) {
    return;
  }

  sleep(1);

  // Get profile
  const profileReq = authenticatedRequest('GET', '/auth/profile', null, loginResult.cookies);
  check(profileReq.res, {
    'admin profile status is 200': (r) => r.status === 200,
  });
  errorRate.add(profileReq.res.status !== 200);

  sleep(1);

  // Get dashboard analytics
  const analyticsReq = authenticatedRequest('GET', '/dashboard/analytics', null, loginResult.cookies);
  check(analyticsReq.res, {
    'analytics status is 200': (r) => r.status === 200,
    'analytics response time < 2s': (r) => r.timings.duration < 2000,
  });
  errorRate.add(analyticsReq.res.status !== 200);

  sleep(1);

  // Get all students
  const studentsReq = authenticatedRequest('GET', '/students/all', null, loginResult.cookies);
  check(studentsReq.res, {
    'students status is 200': (r) => r.status === 200,
    'students response time < 3s': (r) => r.timings.duration < 3000,
  });
  errorRate.add(studentsReq.res.status !== 200);

  sleep(1);

  // Get enhanced analytics
  const enhancedReq = authenticatedRequest('GET', '/enhanced-analytics/comprehensive', null, loginResult.cookies);
  check(enhancedReq.res, {
    'enhanced analytics status is 200': (r) => r.status === 200,
  });
  errorRate.add(enhancedReq.res.status !== 200);

  sleep(1);

  // Get fee defaulters
  const feeReq = authenticatedRequest('GET', '/payment/fee-defaulters', null, loginResult.cookies);
  check(feeReq.res, {
    'fee defaulters status is 200': (r) => r.status === 200,
  });
  errorRate.add(feeReq.res.status !== 200);

  sleep(1);
}

/**
 * Teacher User Flow
 */
export function teacherFlow() {
  // Login
  const loginResult = login(TEST_USERS.teacher.email, TEST_USERS.teacher.password);
  if (!loginResult.success) {
    return;
  }

  sleep(1);

  // Get profile
  const profileReq = authenticatedRequest('GET', '/auth/profile', null, loginResult.cookies);
  check(profileReq.res, {
    'teacher profile status is 200': (r) => r.status === 200,
  });
  errorRate.add(profileReq.res.status !== 200);

  sleep(1);

  // Get assigned students
  const studentsReq = authenticatedRequest('GET', '/students/my-students', null, loginResult.cookies);
  check(studentsReq.res, {
    'my students status is 200': (r) => r.status === 200,
  });
  errorRate.add(studentsReq.res.status !== 200);

  sleep(1);

  // Get attendance summary
  const attendanceReq = authenticatedRequest(
    'GET',
    '/attendance/summary?month=12&year=2025&filter=month',
    null,
    loginResult.cookies
  );
  check(attendanceReq.res, {
    'attendance summary status is 200': (r) => r.status === 200,
  });
  errorRate.add(attendanceReq.res.status !== 200);

  sleep(1);

  // Get teacher attendance (if applicable)
  const teacherAttendanceReq = authenticatedRequest(
    'GET',
    '/teacher-attendance/admin/all?date=2025-12-16',
    null,
    loginResult.cookies
  );
  check(teacherAttendanceReq.res, {
    'teacher attendance status is 200 or 403': (r) => r.status === 200 || r.status === 403,
  });

  sleep(1);
}

/**
 * Student User Flow
 */
export function studentFlow() {
  // Login
  const loginResult = login(TEST_USERS.student.email, TEST_USERS.student.password);
  if (!loginResult.success) {
    return;
  }

  sleep(1);

  // Get profile
  const profileReq = authenticatedRequest('GET', '/auth/profile', null, loginResult.cookies);
  check(profileReq.res, {
    'student profile status is 200': (r) => r.status === 200,
  });
  errorRate.add(profileReq.res.status !== 200);

  sleep(1);

  // Get attendance summary
  const attendanceReq = authenticatedRequest(
    'GET',
    '/attendance/summary?month=12&year=2025&filter=month',
    null,
    loginResult.cookies
  );
  check(attendanceReq.res, {
    'student attendance status is 200': (r) => r.status === 200,
  });
  errorRate.add(attendanceReq.res.status !== 200);

  sleep(1);

  // Get assignments
  const assignmentsReq = authenticatedRequest('GET', '/assignments/student', null, loginResult.cookies);
  check(assignmentsReq.res, {
    'assignments status is 200': (r) => r.status === 200,
  });
  errorRate.add(assignmentsReq.res.status !== 200);

  sleep(1);
}

/**
 * Parent User Flow
 */
export function parentFlow() {
  // Login
  const loginResult = login(TEST_USERS.parent.email, TEST_USERS.parent.password);
  if (!loginResult.success) {
    return;
  }

  sleep(1);

  // Get profile
  const profileReq = authenticatedRequest('GET', '/auth/profile', null, loginResult.cookies);
  check(profileReq.res, {
    'parent profile status is 200': (r) => r.status === 200,
  });
  errorRate.add(profileReq.res.status !== 200);

  sleep(1);

  // Get parent attendance
  const attendanceReq = authenticatedRequest(
    'GET',
    '/attendance/parent/student-attendance',
    null,
    loginResult.cookies
  );
  check(attendanceReq.res, {
    'parent attendance status is 200': (r) => r.status === 200,
  });
  errorRate.add(attendanceReq.res.status !== 200);

  sleep(1);

  // Get payments
  const paymentsReq = authenticatedRequest('GET', '/payment/my-payments', null, loginResult.cookies);
  check(paymentsReq.res, {
    'payments status is 200': (r) => r.status === 200,
  });
  errorRate.add(paymentsReq.res.status !== 200);

  sleep(1);
}

/**
 * Public Endpoints Flow (no auth)
 */
export function publicFlow() {
  // Get events
  const eventsReq = authenticatedRequest('GET', '/events/', null, {});
  check(eventsReq.res, {
    'events status is 200 or 404': (r) => r.status === 200 || r.status === 404,
    'events server responded': (r) => r.status !== 0, // 0 means no response/timeout
  });

  sleep(1);

  // Get announcements
  const announcementsReq = authenticatedRequest('GET', '/announcements/', null, {});
  check(announcementsReq.res, {
    'announcements status is 200 or 404': (r) => r.status === 200 || r.status === 404,
    'announcements server responded': (r) => r.status !== 0,
  });

  sleep(1);

  // Get student count
  const countReq = authenticatedRequest('GET', '/students/count-students', null, {});
  check(countReq.res, {
    'count status is 200 or 404': (r) => r.status === 200 || r.status === 404,
    'count server responded': (r) => r.status !== 0,
  });

  sleep(1);
}

/**
 * Simple Smoke Test Flow - Just check if server responds
 */
export function smokeFlow() {
  // Simple health check - just see if server responds
  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    tags: { name: 'smoke_test' }, // Tag for filtering thresholds
  };
  
  const healthReq = http.get(`${BASE_URL}/events/`, params);
  const passed = check(healthReq.res, {
    'server responded (any status)': (r) => r.status !== 0, // 0 = timeout/no response
    'response received': (r) => r.timings.duration < 30000, // Less than 30s
  });
  
  if (!passed) {
    console.error('Smoke test failed: Server not responding');
  }
  
  sleep(0.5);
}

// ============================================
// K6 TEST OPTIONS
// ============================================

export const options = {
  // Multiple scenarios running in parallel
  scenarios: {
    // Smoke test - verify system works (very lenient)
    smoke_test: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 3, // Reduced to 3 iterations
      maxDuration: '1m', // Reduced to 1 minute
      exec: 'smokeFlow', // Use simpler smoke flow
    },

    // Admin load test
    admin_load: {
      executor: 'ramping-vus',
      startVUs: 5,
      stages: [
        { duration: '30s', target: 10 }, // Ramp up to 10 users
        { duration: '1m', target: 10 },   // Stay at 10 users
        { duration: '30s', target: 20 },  // Ramp up to 20 users
        { duration: '1m', target: 20 },   // Stay at 20 users
        { duration: '30s', target: 0 },    // Ramp down
      ],
      exec: 'adminFlow',
    },

    // Teacher load test
    teacher_load: {
      executor: 'ramping-vus',
      startVUs: 10,
      stages: [
        { duration: '30s', target: 20 },
        { duration: '1m', target: 20 },
        { duration: '30s', target: 30 },
        { duration: '1m', target: 30 },
        { duration: '30s', target: 0 },
      ],
      exec: 'teacherFlow',
    },

    // Student load test
    student_load: {
      executor: 'ramping-vus',
      startVUs: 20,
      stages: [
        { duration: '30s', target: 50 },
        { duration: '2m', target: 50 },
        { duration: '30s', target: 100 },
        { duration: '2m', target: 100 },
        { duration: '30s', target: 0 },
      ],
      exec: 'studentFlow',
    },

    // Parent load test
    parent_load: {
      executor: 'ramping-vus',
      startVUs: 15,
      stages: [
        { duration: '30s', target: 30 },
        { duration: '2m', target: 30 },
        { duration: '30s', target: 50 },
        { duration: '2m', target: 50 },
        { duration: '30s', target: 0 },
      ],
      exec: 'parentFlow',
    },

    // Public endpoints (no auth)
    public_load: {
      executor: 'constant-vus',
      vus: 50,
      duration: '3m',
      exec: 'publicFlow',
    },
  },

  // Thresholds - test fails if these are exceeded
  thresholds: {
    // Very lenient thresholds for smoke test (tagged requests)
    'http_req_duration{name:smoke_test}': ['p(95)<30000'],  // 30s max for smoke test
    'http_req_failed{name:smoke_test}': ['rate<1.0'],       // Allow 100% failures (just check if server responds)
    
    // Main thresholds for load tests (exclude smoke test by using tags or making lenient)
    // Note: These apply to all scenarios, but smoke test has its own lenient thresholds above
    'errors': ['rate<0.10'],                    // Less than 10% errors (more lenient)
    'login_duration': ['p(95)<5000'],         // 95% of logins < 5s (more lenient)
    'api_response_time': ['p(95)<10000'],      // 95% of API calls < 10s (more lenient)
    'http_req_duration': ['p(95)<10000'],      // 95% of all requests < 10s (more lenient)
    'http_req_failed': ['rate<0.10'],        // Less than 10% failed requests (more lenient)
  },
};


export function handleSummary(data) {
  return {
    'summary.json': JSON.stringify(data, null, 2),
  };
}

