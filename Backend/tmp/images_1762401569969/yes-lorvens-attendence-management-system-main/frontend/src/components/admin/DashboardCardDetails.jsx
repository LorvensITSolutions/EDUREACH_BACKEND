import React, { useState, useCallback, useEffect } from 'react';
import { formatTimeIST, formatDate } from '../../utils/helpers';
import { adminAPI } from '../../services/api/adminAPI';

const DashboardCardDetails = ({ type, stats, data }) => {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // (moved useEffect below to avoid "used before defined" linter warning)

  const fetchEmployees = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const params = { limit: 50 };
      if (type === 'inactive') {
        // Dashboard "Inactive" count includes non-active users (inactive + pending)
        const [inactiveRes, pendingRes] = await Promise.all([
          adminAPI.getAllEmployees({ ...params, status: 'inactive' }),
          adminAPI.getAllEmployees({ ...params, status: 'pending' }),
        ]);
        const inactive = inactiveRes.data?.data?.employees || [];
        const pending = pendingRes.data?.data?.employees || [];
        const byId = new Map();
        [...inactive, ...pending].forEach((u) => byId.set(u._id, u));
        let combined = [...byId.values()];

        // Fallback: if empty, fetch all and filter non-active client-side (aligns with dashboard count logic)
        if (combined.length === 0) {
          const allRes = await adminAPI.getAllEmployees({ ...params });
          const all = allRes.data?.data?.employees || [];
          combined = all.filter((u) => u.status !== 'active');
        }

        setEmployees(combined);
        return;
      } else if (type === 'activeEmployees') {
        params.status = 'active';
      }
      const response = await adminAPI.getAllEmployees(params);
      setEmployees(response.data.data.employees || []);
    } catch (err) {
      console.error('Error fetching employees:', err);
      setError('Failed to load employees');
    } finally {
      setLoading(false);
    }
  }, [type]);

  const fetchAttendanceData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      // Get today's date in IST timezone (YYYY-MM-DD format)
      const today = formatDate(new Date(), 'YYYY-MM-DD');

      // For present/absent, use the special today endpoint which returns
      // statuses: 'completed', 'punched-in', 'not-started', 'absent'
      if (type === 'attendance' || type === 'absent') {
        if (type === 'attendance') {
          const todayResp = await adminAPI.getTodayAttendance(today);
          const list = todayResp.data.data.employees || [];
          const filtered = list.filter((emp) => ['completed', 'punched-in'].includes(emp.status));
          setEmployees(filtered);
        } else {
          // For absent/not working, check if work day is completed
          const dashboardStats = await adminAPI.getDashboardStats();
          const isWorkDayCompleted = dashboardStats.data.data.isWorkDayCompleted;
          
          if (isWorkDayCompleted) {
            // After work day completion, show both 'not-started' and 'absent' employees
            const [todayResp, absentResp] = await Promise.all([
              adminAPI.getTodayAttendance(today),
              adminAPI.getEmployeesByAttendanceStatus('absent', today)
            ]);
            
            const todayList = todayResp.data.data.employees || [];
            const absentList = absentResp.data.data.employees || [];
            
            // Get employees with 'not-started' status from today's attendance
            const notStartedEmployees = todayList.filter((emp) => emp.status === 'not-started');
            
            // Combine both lists, avoiding duplicates
            const combinedEmployees = [...notStartedEmployees];
            absentList.forEach(absentEmp => {
              const exists = combinedEmployees.find(emp => emp.employeeId === absentEmp.employeeId);
              if (!exists) {
                combinedEmployees.push(absentEmp);
              }
            });
            
            setEmployees(combinedEmployees);
          } else {
            // During work day, only show 'not-started' employees (not working)
            const todayResp = await adminAPI.getTodayAttendance(today);
            const todayList = todayResp.data.data.employees || [];
            const notStartedEmployees = todayList.filter((emp) => emp.status === 'not-started');
            setEmployees(notStartedEmployees);
          }
        }
        return;
      }

      // For leave/work from home/on duty/half-day, use the new by-status endpoint
      let status;
      if (type === 'leave') status = 'leave';
      else if (type === 'workFromHome') status = 'work-from-home';
      else if (type === 'onDuty') status = 'on-duty';
      else if (type === 'halfDay') status = 'half-day';

      if (status) {
        const response = await adminAPI.getEmployeesByAttendanceStatus(status, today);
        const employees = response.data.data.employees || [];
        setEmployees(employees);
        return;
      }

      // Fallback to old method for other statuses
      const params = { startDate: today, endDate: today };
      if (type === 'leave') params.status = 'leave';
      if (type === 'workFromHome') params.status = 'work-from-home';
      if (type === 'onDuty') params.status = 'on-duty';

      const attendanceResp = await adminAPI.getAllAttendance(params);
      const records = attendanceResp.data.data.attendance || [];
      const mapped = records
        .filter((rec) => rec.employee) // ensure populated
        .map((rec) => ({
          employeeId: rec.employee.employeeId,
          name: rec.employee.name,
          department: rec.employee.department,
          status: rec.status,
          attendanceId: rec._id,
        }));
      setEmployees(mapped);
    } catch (err) {
      console.error('Error fetching attendance data:', err);
      setError('Failed to load attendance data');
    } finally {
      setLoading(false);
    }
  }, [type]);

  // Fetch employees based on card type
  useEffect(() => {
    if (type === 'totalEmployees' || type === 'activeEmployees' || type === 'inactive') {
      fetchEmployees();
    } else if (type === 'attendance' || type === 'absent' || type === 'leave' || type === 'workFromHome' || type === 'onDuty' || type === 'halfDay') {
      fetchAttendanceData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, fetchEmployees, fetchAttendanceData]);

  const getStatusBadge = (status) => {
    const { getStatusDisplay } = require('../../utils/helpers');
    const statusDisplay = getStatusDisplay(status);
    
    return (
      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${statusDisplay.bgColor} ${statusDisplay.textColor} ${statusDisplay.darkBgColor} ${statusDisplay.darkTextColor}`}>
        {statusDisplay.label}
      </span>
    );
  };

  const renderEmployeesDetails = () => {
    const isTotalEmployees = type === 'totalEmployees';
    const isActiveEmployees = type === 'activeEmployees';
    
    return (
      <div className="space-y-6">
        {/* Employee List */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            {isTotalEmployees ? 'All Employees' : isActiveEmployees ? 'Active Employees' : 'Employees'}
          </h3>
          
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
              <span className="ml-2 text-gray-600">Loading employees...</span>
            </div>
          ) : error ? (
            <div className="text-red-600 text-center py-4">{error}</div>
          ) : employees.length === 0 ? (
            <div className="text-gray-500 dark:text-gray-400 text-center py-4">No employees found</div>
          ) : (
            <div className="space-y-3">
              {employees.map((employee) => (
                <div
                  key={employee._id}
                  className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors cursor-pointer"
                  onClick={() => window.location.href = `/admin/employees/${employee._id}/details`}
                >
                  <div className="flex items-center space-x-3">
                    <div className="h-8 w-8 rounded-full bg-gradient-to-r from-blue-400 to-purple-400 flex items-center justify-center">
                      <span className="text-xs font-medium text-white">
                        {employee.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{employee.name}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{employee.department}</div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {/* Don't show status badges for any employee cards */}
                    <div className="text-xs text-gray-400 dark:text-gray-500">ID: {employee.employeeId}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {employees.length > 0 && (
            <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-600">
              <button
                onClick={() => window.location.href = '/admin/employees'}
                className="w-full text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium transition-colors"
              >
                View All Employees →
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderAttendanceDetails = () => (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Today's Attendance</h3>
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-gray-600 dark:text-gray-400">Present</span>
            <span className="font-semibold text-green-600">{stats.todayAttendance}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-600 dark:text-gray-400">Late</span>
            <span className="font-semibold text-yellow-600">{stats.lateToday}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-600 dark:text-gray-400">Half Day</span>
            <span className="font-semibold text-orange-600">{stats.halfDayToday}</span>
          </div>
          <div className="pt-2 border-t border-gray-200 dark:border-gray-600">
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">Attendance Rate</span>
              <span className="font-semibold text-blue-600">{stats.attendancePercentage}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Present Employees List */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Present Today</h3>
        
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500"></div>
            <span className="ml-2 text-gray-600">Loading employees...</span>
          </div>
        ) : error ? (
          <div className="text-red-600 text-center py-4">{error}</div>
        ) : employees.length === 0 ? (
          <div className="text-gray-500 dark:text-gray-400 text-center py-4">No employees present today</div>
        ) : (
          <div className="space-y-3">
            {employees.map((employee) => (
              <div
                key={employee.employeeId}
                className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors cursor-pointer"
                onClick={() => window.location.href = `/admin/employees/${employee.attendanceId || employee.employeeId}/details`}
              >
                <div className="flex items-center space-x-3">
                  <div className="h-8 w-8 rounded-full bg-gradient-to-r from-green-400 to-emerald-400 flex items-center justify-center">
                    <span className="text-xs font-medium text-white">
                      {employee.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{employee.name}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{employee.department}</div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                    employee.status === 'late' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' :
                    employee.status === 'half-day' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300' :
                    'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                  }`}>
                    {employee.status === 'late' ? 'Late' :
                     employee.status === 'half-day' ? 'Half Day' : 'Present'}
                  </span>
                  <div className="text-xs text-gray-400 dark:text-gray-500">ID: {employee.employeeId}</div>
                </div>
              </div>
            ))}
          </div>
        )}
        
        {employees.length > 0 && (
          <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-600">
            <button
              onClick={() => window.location.href = '/admin/attendance'}
              className="w-full text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300 text-sm font-medium transition-colors"
            >
              View All Attendance Records →
            </button>
          </div>
        )}
      </div>


    </div>
  );

  const renderAbsentDetails = () => {
    const isWorkDayCompleted = stats?.isWorkDayCompleted;
    const isToday = stats?.isToday;
    const title = isToday && !isWorkDayCompleted ? 'Not Working Today' : 'Absent Today';
    const statusLabel = isToday && !isWorkDayCompleted ? 'Not Working' : 'Absent';
    
    return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">{title}</h3>
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-gray-600 dark:text-gray-400">{isToday && !isWorkDayCompleted ? 'Total Not Working' : 'Total Absent'}</span>
            <span className="font-semibold text-red-600">{stats.absentToday}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-600 dark:text-gray-400">On Leave</span>
            <span className="font-semibold text-purple-600">{stats.leaveToday}</span>
          </div>
          <div className="pt-2 border-t border-gray-200 dark:border-gray-600">
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">{isToday && !isWorkDayCompleted ? 'Not Working Rate' : 'Absence Rate'}</span>
              <span className="font-semibold text-red-600">
                {stats.absentPercentage !== undefined ? stats.absentPercentage : 
                 (stats.activeEmployees > 0 ? Math.round((stats.absentToday / stats.activeEmployees) * 100) : 0)}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Absent Employees List */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">{isToday && !isWorkDayCompleted ? 'Not Working Employees' : 'Absent Employees'}</h3>
        
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500"></div>
            <span className="ml-2 text-gray-600">Loading employees...</span>
          </div>
        ) : error ? (
          <div className="text-red-600 text-center py-4">{error}</div>
        ) : employees.length === 0 ? (
          <div className="text-gray-500 dark:text-gray-400 text-center py-4">
            {isToday && !isWorkDayCompleted ? 'No employees not working today' : 'No absent employees today'}
          </div>
        ) : (
          <div className="space-y-3">
            {employees.map((employee) => (
              <div
                key={employee.employeeId}
                className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-900/20 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors cursor-pointer"
                onClick={() => window.location.href = `/admin/employees/${employee.attendanceId || employee.employeeId}/details`}
              >
                <div className="flex items-center space-x-3">
                  <div className="h-8 w-8 rounded-full bg-gradient-to-r from-red-400 to-pink-400 flex items-center justify-center">
                    <span className="text-xs font-medium text-white">
                      {employee.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{employee.name}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{employee.department}</div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
                    {statusLabel}
                  </span>
                  <div className="text-xs text-gray-400 dark:text-gray-500">ID: {employee.employeeId}</div>
                </div>
              </div>
            ))}
          </div>
        )}
        
        {employees.length > 0 && (
          <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-600">
            <button
              onClick={() => window.location.href = '/admin/attendance'}
              className="w-full text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 text-sm font-medium transition-colors"
            >
              View All Attendance Records →
            </button>
          </div>
        )}
      </div>


    </div>
  );
  };

  const renderLateDetails = () => (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Late Arrivals Today</h3>
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-gray-600 dark:text-gray-400">Late Today</span>
            <span className="font-semibold text-yellow-600">{stats.lateToday}</span>
          </div>
          <div className="pt-2 border-t border-gray-200 dark:border-gray-600">
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">Late Rate</span>
              <span className="font-semibold text-yellow-600">
                {stats.activeEmployees > 0 ? Math.round((stats.lateToday / stats.activeEmployees) * 100) : 0}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Late Employees List */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Late Employees</h3>
        
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-500"></div>
            <span className="ml-2 text-gray-600 dark:text-gray-400">Loading employees...</span>
          </div>
        ) : error ? (
          <div className="text-red-600 text-center py-4">{error}</div>
        ) : employees.length === 0 ? (
          <div className="text-gray-500 dark:text-gray-400 text-center py-4">No late employees today</div>
        ) : (
          <div className="space-y-3">
            {employees.map((employee) => (
              <div
                key={employee.employeeId}
                className="flex items-center justify-between p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg hover:bg-yellow-100 dark:hover:bg-yellow-900/30 transition-colors cursor-pointer"
                onClick={() => window.location.href = `/admin/employees/${employee.attendanceId || employee.employeeId}/details`}
              >
                <div className="flex items-center space-x-3">
                  <div className="h-8 w-8 rounded-full bg-gradient-to-r from-yellow-400 to-orange-400 flex items-center justify-center">
                    <span className="text-xs font-medium text-white">
                      {employee.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{employee.name}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{employee.department}</div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
                    Late
                  </span>
                  <div className="text-xs text-gray-400 dark:text-gray-500">ID: {employee.employeeId}</div>
                </div>
              </div>
            ))}
          </div>
        )}
        
        {employees.length > 0 && (
          <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-600">
            <button
              onClick={() => window.location.href = '/admin/attendance'}
              className="w-full text-yellow-600 hover:text-yellow-800 dark:text-yellow-400 dark:hover:text-yellow-300 text-sm font-medium transition-colors"
            >
              View All Attendance Records →
            </button>
          </div>
        )}
      </div>
    </div>
  );

  const renderLeaveDetails = () => (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Leave Today</h3>
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-gray-600 dark:text-gray-400">On Leave</span>
            <span className="font-semibold text-purple-600">{stats.leaveToday}</span>
          </div>
          <div className="pt-2 border-t border-gray-200 dark:border-gray-600">
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">Leave Rate</span>
              <span className="font-semibold text-purple-600">
                {stats.activeEmployees > 0 ? Math.round((stats.leaveToday / stats.activeEmployees) * 100) : 0}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Leave Employees List */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Employees on Leave</h3>
        
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
            <span className="ml-2 text-gray-600">Loading employees...</span>
          </div>
        ) : error ? (
          <div className="text-red-600 text-center py-4">{error}</div>
        ) : employees.length === 0 ? (
          <div className="text-gray-500 dark:text-gray-400 text-center py-4">No employees on leave today</div>
        ) : (
          <div className="space-y-3">
            {employees.map((employee) => (
              <div
                key={employee.employeeId}
                className="flex items-center justify-between p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors cursor-pointer"
                onClick={() => window.location.href = `/admin/employees/${employee.attendanceId || employee.employeeId}/details`}
              >
                <div className="flex items-center space-x-3">
                  <div className="h-8 w-8 rounded-full bg-gradient-to-r from-purple-400 to-pink-400 flex items-center justify-center">
                    <span className="text-xs font-medium text-white">
                      {employee.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{employee.name}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{employee.department}</div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
                    On Leave
                  </span>
                  <div className="text-xs text-gray-400 dark:text-gray-500">ID: {employee.employeeId}</div>
                </div>
              </div>
            ))}
          </div>
        )}
        
        {employees.length > 0 && (
          <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-600">
            <button
              onClick={() => window.location.href = '/admin/attendance'}
              className="w-full text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-300 text-sm font-medium transition-colors"
            >
              View All Attendance Records →
            </button>
          </div>
        )}
      </div>
    </div>
  );

  const renderInactiveDetails = () => (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Inactive Employees</h3>
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-gray-600 dark:text-gray-400">Inactive</span>
            <span className="font-semibold text-gray-600 dark:text-gray-400">{stats.inactiveEmployees}</span>
          </div>
          <div className="pt-2 border-t border-gray-200 dark:border-gray-600">
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">Inactive Rate</span>
              <span className="font-semibold text-gray-600 dark:text-gray-400">
                {stats.totalEmployees > 0 ? Math.round((stats.inactiveEmployees / stats.totalEmployees) * 100) : 0}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Inactive Employee List */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Inactive Employee List</h3>
        
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-500"></div>
            <span className="ml-2 text-gray-600">Loading employees...</span>
          </div>
        ) : error ? (
          <div className="text-red-600 text-center py-4">{error}</div>
        ) : employees.length === 0 ? (
          <div className="text-gray-500 dark:text-gray-400 text-center py-4">No inactive employees found</div>
        ) : (
          <div className="space-y-3">
            {employees.map((employee) => (
              <div
                key={employee._id}
                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors cursor-pointer"
                onClick={() => window.location.href = `/admin/employees/${employee._id}/details`}
              >
                <div className="flex items-center space-x-3">
                  <div className="h-8 w-8 rounded-full bg-gradient-to-r from-gray-400 to-gray-500 flex items-center justify-center">
                    <span className="text-xs font-medium text-white">
                      {employee.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{employee.name}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{employee.department}</div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  {getStatusBadge(employee.status)}
                  <div className="text-xs text-gray-400 dark:text-gray-500">ID: {employee.employeeId}</div>
                </div>
              </div>
            ))}
          </div>
        )}
        
        {employees.length > 0 && (
          <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-600">
            <button
              onClick={() => window.location.href = '/admin/employees?status=inactive'}
              className="w-full text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-300 text-sm font-medium transition-colors"
            >
              View All Inactive Employees →
            </button>
          </div>
        )}
      </div>


    </div>
  );

  const renderHalfDayDetails = () => (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Half Day Today</h3>
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-gray-600 dark:text-gray-400">Half Day</span>
            <span className="font-semibold text-orange-600">{stats.halfDayToday}</span>
          </div>
          <div className="pt-2 border-t border-gray-200 dark:border-gray-600">
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">Half Day Rate</span>
              <span className="font-semibold text-orange-600">
                {stats.activeEmployees > 0 ? Math.round((stats.halfDayToday / stats.activeEmployees) * 100) : 0}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Half Day Employees List */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Half Day Employees</h3>
        
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
            <span className="ml-2 text-gray-600">Loading employees...</span>
          </div>
        ) : error ? (
          <div className="text-red-600 text-center py-4">{error}</div>
        ) : employees.length === 0 ? (
          <div className="text-gray-500 dark:text-gray-400 text-center py-4">No half day employees today</div>
        ) : (
          <div className="space-y-3">
            {employees.map((employee) => (
              <div
                key={employee.employeeId}
                className="flex items-center justify-between p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors cursor-pointer"
                onClick={() => window.location.href = `/admin/employees/${employee.attendanceId || employee.employeeId}/details`}
              >
                <div className="flex items-center space-x-3">
                  <div className="h-8 w-8 rounded-full bg-gradient-to-r from-orange-400 to-red-400 flex items-center justify-center">
                    <span className="text-xs font-medium text-white">
                      {employee.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{employee.name}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{employee.department}</div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300">
                    Half Day
                  </span>
                  <div className="text-xs text-gray-400 dark:text-gray-500">ID: {employee.employeeId}</div>
                </div>
              </div>
            ))}
          </div>
        )}
        
        {employees.length > 0 && (
          <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-600">
            <button
              onClick={() => window.location.href = '/admin/attendance'}
              className="w-full text-orange-600 hover:text-orange-800 dark:text-orange-400 dark:hover:text-orange-300 text-sm font-medium transition-colors"
            >
              View All Attendance Records →
            </button>
          </div>
        )}
      </div>
    </div>
  );

  const renderContent = () => {
    switch (type) {
      case 'totalEmployees':
      case 'activeEmployees':
      case 'employees':
        return renderEmployeesDetails();
      case 'attendance':
        return renderAttendanceDetails();
      case 'absent':
        return renderAbsentDetails();
      case 'late':
        return renderLateDetails();
      case 'leave':
        return renderLeaveDetails();
      case 'inactive':
        return renderInactiveDetails();
      case 'halfDay':
        return renderHalfDayDetails();
      default:
        return <div>No details available</div>;
    }
  };

  return (
    <div className="space-y-4">
      {renderContent()}
    </div>
  );
};

export default DashboardCardDetails; 