// generator.js (ESM, improved)
// - Sections support for ClassGroup
// - Global teacher availability (no cross-section double-booking)
// - Teacher preferences: maxPerDay & unavailableSlots
// - Configurable break / lunch positions
// - Timetable persisted per class-section
// - Time slot generation aligned with breaks
// - Better validation & clear error messages

export class Subject {
  constructor(name, periodsPerWeek) {
    this.name = name;
    this.periodsPerWeek = periodsPerWeek;
  }
}

export class Teacher {
  /**
   * name: string
   * subjects: array of subject names
   * options: { maxPerDay = Infinity, unavailableSlots = [{day, period}], preferNoLastPeriod = false }
   */
  constructor(name, subjects = [], options = {}) {
    this.name = name;
    this.subjects = subjects;
    this.maxPerDay = options.maxPerDay ?? Infinity;
    this.unavailableSlots = options.unavailableSlots ?? []; // [{ day: "Mon", period: 2 }]
    this.preferNoLastPeriod = !!options.preferNoLastPeriod;
  }
}

export class ClassGroup {
  /**
   * name: "Grade 10"
   * sections: ["A","B"]  (optional; default ["A"])
   * subjects: array of Subject
   */
  constructor(name, sections = ["A"], subjects = []) {
    this.name = name;
    this.sections = sections.length ? sections : ["A"];
    this.subjects = subjects;
  }
}

export class TimetableGenerator {
  constructor() {
    this.maxIterations = 1000;
    this.qualityMetrics = null; // Will store quality metrics after generation
  }

  /**
   * classes: array of ClassGroup
   * teachers: array of Teacher
   * days: array of day names, e.g. ["Mon","Tue",...]
   * periodsPerDay: number
   * options: {
   *   startTime, endTime, periodDuration, breakDuration,
   *   breakAfterPeriods: [2,4] // after which periods to insert short breaks (1-based)
   *   lunchAfterPeriod: 4 // (1-based) insert lunch after this period
   * }
   */
  generateTimetable(classes, teachers, days, periodsPerDay, {
    startTime = "08:00",
    endTime = null, // optional; computed from durations if not provided
    periodDuration = 45,
    breakDuration = 10,
    breakAfterPeriods = [2], // default short break after period 2
    lunchAfterPeriod = null // optional (1-based index)
  } = {}) {
    try {
      this._validateInputs(classes, teachers, days, periodsPerDay);

      // Build teacherSubjectMap and teacher objects map
      const teacherSubjectMap = this._createTeacherSubjectMap(teachers);
      const teacherMap = {};
      teachers.forEach(t => { teacherMap[t.name] = t; });

      // Generate time slots using break positions and lunch
      const timeSlots = this._generateTimeSlots(startTime, endTime, periodDuration, breakDuration, periodsPerDay, breakAfterPeriods, lunchAfterPeriod, days);

      // Generate timetable (per class -> section -> day -> periods)
      const timetable = this._generateConstraintSatisfiedTimetable(
        classes, teacherSubjectMap, teacherMap, days, periodsPerDay, breakAfterPeriods, lunchAfterPeriod
      );

      if (timetable) {
        // Calculate quality metrics
        const qualityMetrics = this._calculateQualityMetrics(timetable, classes, teachers, days, periodsPerDay, teacherMap);
        this.qualityMetrics = qualityMetrics;
        
        return { 
          success: true, 
          timetable, 
          timeSlots,
          quality: qualityMetrics
        };
      } else {
        return { success: false, error: "Unable to generate valid timetable. Constraints may be too restrictive." };
      }
    } catch (err) {
      return { success: false, error: `Error generating timetable: ${err.message}` };
    }
  }

  _validateInputs(classes, teachers, days, periodsPerDay) {
    if (!Array.isArray(classes) || classes.length === 0) throw new Error("At least one class must be defined");
    if (!Array.isArray(teachers) || teachers.length === 0) throw new Error("At least one teacher must be defined");
    if (!Array.isArray(days) || days.length === 0) throw new Error("At least one day must be defined");
    if (!Number.isInteger(periodsPerDay) || periodsPerDay <= 0) throw new Error("Periods per day must be a positive integer");

    // Collect subjects from classes
    const allSubjects = new Set();
    classes.forEach(c => {
      if (!Array.isArray(c.subjects)) throw new Error(`Class ${c.name} subjects must be an array`);
      c.subjects.forEach(s => {
        if (!s || !s.name) throw new Error(`Invalid subject in class ${c.name}`);
        allSubjects.add(s.name);
      });
    });

    // Collect subjects from teachers
    const teacherSubjects = new Set();
    teachers.forEach(t => {
      if (!Array.isArray(t.subjects)) throw new Error(`Teacher ${t.name} subjects must be an array`);
      t.subjects.forEach(s => teacherSubjects.add(s));
    });

    const missingSubjects = [...allSubjects].filter(s => !teacherSubjects.has(s));
    if (missingSubjects.length > 0) {
      throw new Error(`No teacher assigned for subjects: ${missingSubjects.join(", ")}`);
    }

    // Ensure each class-section has enough total slots for requested periods/week
    classes.forEach(c => {
      const totalPeriodsRequiredPerWeek = c.subjects.reduce((sum, s) => sum + (s.periodsPerWeek || 0), 0);
      const totalSlotsPerWeek = days.length * periodsPerDay;
      if (totalPeriodsRequiredPerWeek > totalSlotsPerWeek) {
        throw new Error(`Class ${c.name} requires ${totalPeriodsRequiredPerWeek} periods/week but only ${totalSlotsPerWeek} slots available per section. Reduce subject periods or increase periodsPerDay/days.`);
      }
    });
  }

  _createTeacherSubjectMap(teachers) {
    const map = {};
    teachers.forEach(teacher => {
      teacher.subjects.forEach(sub => {
        if (!map[sub]) map[sub] = [];
        map[sub].push(teacher.name);
      });
    });
    return map;
  }

  _generateConstraintSatisfiedTimetable(classes, teacherSubjectMap, teacherMap, days, periodsPerDay, breakAfterPeriods = [], lunchAfterPeriod = null) {
    // Timetable structure: timetable[className][section][day] = [slots...]
    const timetable = {};

    // Initialize timetable for each class-section-day
    classes.forEach(c => {
      if (!c.name) {
        throw new Error(`Class name is undefined. Class object: ${JSON.stringify(c)}`);
      }
      timetable[c.name] = {};
      c.sections.forEach(sec => {
        if (!sec) {
          throw new Error(`Section is undefined for class ${c.name}. Sections: ${JSON.stringify(c.sections)}`);
        }
        timetable[c.name][sec] = {};
        days.forEach(d => {
          if (!d) {
            throw new Error(`Day is undefined. Days array: ${JSON.stringify(days)}`);
          }
          timetable[c.name][sec][d] = new Array(periodsPerDay).fill(null);
        });
      });
    });

    // Global teacher availability: teacherAvailability[teacherName][day][period] = boolean
    const teacherAvailability = {};
    Object.keys(teacherMap).forEach(tn => {
      teacherAvailability[tn] = {};
      days.forEach(d => {
        teacherAvailability[tn][d] = new Array(periodsPerDay).fill(true);
      });

      // mark unavailable slots per teacher preferences
      const tObj = teacherMap[tn];
      if (Array.isArray(tObj.unavailableSlots)) {
        tObj.unavailableSlots.forEach(slot => {
          if (slot && slot.day && Number.isInteger(slot.period) && slot.period >= 1 && slot.period <= periodsPerDay) {
            teacherAvailability[tn][slot.day][slot.period - 1] = false;
          }
        });
      }

      // if preferNoLastPeriod, mark last period as less-preferred (we'll avoid it during assignment where possible)
      // We do not block it entirely here; preference handled in selection scoring.
    });

    // Track per-teacher counts per day (to enforce maxPerDay)
    const teacherCountPerDay = {};
    Object.keys(teacherMap).forEach(tn => {
      teacherCountPerDay[tn] = {};
      days.forEach(d => { teacherCountPerDay[tn][d] = 0; });
    });

    // Helper to place for each class-section
    const classSectionList = [];
    classes.forEach(c => {
      c.sections.forEach(sec => classSectionList.push({ classObj: c, section: sec }));
    });

    // Enhanced: Try multiple class-section ordering strategies for better distribution
    // Strategy 1: Process by class size (larger classes first - more constraints)
    // Strategy 2: Process by subject count (more subjects first)
    // Strategy 3: Random order
    const strategies = [
      // Strategy 1: Sort by total periods required (descending)
      [...classSectionList].sort((a, b) => {
        const aTotal = a.classObj.subjects.reduce((sum, s) => sum + (s.periodsPerWeek || 0), 0);
        const bTotal = b.classObj.subjects.reduce((sum, s) => sum + (s.periodsPerWeek || 0), 0);
        return bTotal - aTotal;
      }),
      // Strategy 2: Sort by number of subjects (descending)
      [...classSectionList].sort((a, b) => b.classObj.subjects.length - a.classObj.subjects.length),
      // Strategy 3: Random order
      [...classSectionList].sort(() => Math.random() - 0.5)
    ];

    // Try each strategy until one succeeds
    for (const strategy of strategies) {
      // Clone availability for this strategy attempt
      const strategyAv = this._deepClone(teacherAvailability);
      const strategyCounts = this._deepClone(teacherCountPerDay);
      const strategyTimetable = this._deepClone(timetable);
      
      let strategySuccess = true;
      for (const { classObj, section } of strategy) {
        const ok = this._generateSectionTimetable(
          classObj, section, strategyTimetable, teacherSubjectMap, strategyAv, teacherMap, strategyCounts, days, periodsPerDay
        );
        if (!ok) {
          strategySuccess = false;
          break;
        }
      }
      
      if (strategySuccess) {
        // Copy successful strategy results back
        Object.keys(strategyTimetable).forEach(className => {
          timetable[className] = strategyTimetable[className];
        });
        Object.keys(strategyAv).forEach(tn => {
          days.forEach(d => {
            for (let p = 0; p < periodsPerDay; p++) {
              teacherAvailability[tn][d][p] = strategyAv[tn][d][p];
            }
          });
        });
        Object.keys(strategyCounts).forEach(tn => {
          days.forEach(d => teacherCountPerDay[tn][d] = strategyCounts[tn][d]);
        });
        break;
      }
    }

    // If all strategies failed, try original order as fallback
    let allFailed = true;
    for (const { classObj, section } of classSectionList) {
      const ok = this._generateSectionTimetable(
        classObj, section, timetable, teacherSubjectMap, teacherAvailability, teacherMap, teacherCountPerDay, days, periodsPerDay
      );
      if (!ok) {
        allFailed = true;
        break;
      } else {
        allFailed = false;
      }
    }
    
    if (allFailed) return null;

    // Insert library or free period for empty last period or preserve as-is
    // (Keep timetable as-is; admin can post-process to assign Library/Librarian to empty slots)
    return timetable;
  }

  _generateSectionTimetable(classObj, section, timetable, teacherSubjectMap, teacherAvailability, teacherMap, teacherCountPerDay, days, periodsPerDay) {
    // Build subject schedule for this section
    let subjectSchedule = [];
    classObj.subjects.forEach(s => {
      const count = Number(s.periodsPerWeek) || 0;
      for (let i = 0; i < count; i++) subjectSchedule.push(s.name);
    });

    const totalSlotsWeek = days.length * periodsPerDay;
    if (subjectSchedule.length > totalSlotsWeek) return false;

    // Ensure timetable structure exists for this class-section
    if (!timetable[classObj.name]) {
      timetable[classObj.name] = {};
    }
    if (!timetable[classObj.name][section]) {
      timetable[classObj.name][section] = {};
      // Initialize all days for this section
      days.forEach(d => {
        if (d) {
          timetable[classObj.name][section][d] = new Array(periodsPerDay).fill(null);
        }
      });
    }

    // Enhanced: Try multiple attempts with progressive constraint relaxation
    // Increased attempts for better success rate
    for (let attempt = 0; attempt < 100; attempt++) {
      // Reset this section's timetable - ensure structure exists
      days.forEach(d => {
        if (!d) return; // Skip invalid days
        if (!timetable[classObj.name][section][d]) {
          timetable[classObj.name][section][d] = new Array(periodsPerDay).fill(null);
        } else {
          timetable[classObj.name][section][d] = new Array(periodsPerDay).fill(null);
        }
      });

      // NOTE: teacherAvailability & teacherCountPerDay are global and should not be fully reset here,
      // because other sections' assignments must remain. But we must ensure we don't permanently block teachers
      // from this attempt if it fails. So we will clone availability & counts for attempt and then commit on success.

      const avCopy = this._deepClone(teacherAvailability);
      const countsCopy = this._deepClone(teacherCountPerDay);

      // shuffle subjectSchedule to vary placement
      subjectSchedule = subjectSchedule.sort(() => Math.random() - 0.5);

      let success = true;
      for (const subjectName of subjectSchedule) {
        const placed = this._placeSubjectPeriodForSection(
          classObj.name, section, subjectName, timetable, teacherSubjectMap, avCopy, countsCopy, teacherMap, days, periodsPerDay, attempt
        );
        if (!placed) {
          success = false;
          break;
        }
      }

      if (success) {
        // commit avCopy and countsCopy into original teacherAvailability and teacherCountPerDay
        Object.keys(avCopy).forEach(tn => {
          days.forEach(d => {
            for (let p = 0; p < periodsPerDay; p++) {
              teacherAvailability[tn][d][p] = avCopy[tn][d][p];
            }
          });
        });
        Object.keys(countsCopy).forEach(tn => {
          days.forEach(d => teacherCountPerDay[tn][d] = countsCopy[tn][d]);
        });
        return true;
      }
      // else next attempt - log failure reason for debugging
      if (attempt === 99) {
        console.log(`Failed to generate timetable for ${classObj.name} section ${section} after 100 attempts`);
        console.log(`Subject schedule: ${subjectSchedule.join(', ')}`);
        console.log(`Available slots per day: ${days.map(d => timetable[classObj.name][section][d].filter(x => !x).length).join(', ')}`);
      }
    }
    return false;
  }

  _placeSubjectPeriodForSection(className, section, subjectName, timetable, teacherSubjectMap, teacherAvailability, teacherCountPerDay, teacherMap, days, periodsPerDay, attempt = 0) {
    const availableTeachers = teacherSubjectMap[subjectName] || [];
    if (!availableTeachers.length) return false;

    // Ensure timetable structure exists
    if (!timetable[className]) {
      timetable[className] = {};
    }
    if (!timetable[className][section]) {
      timetable[className][section] = {};
    }

    // Order days by how many empty slots they have for this section (descending)
    const sortedDays = days.slice().filter(d => d).sort((a, b) => {
      // Ensure day structure exists
      if (!timetable[className][section][a]) {
        timetable[className][section][a] = new Array(periodsPerDay).fill(null);
      }
      if (!timetable[className][section][b]) {
        timetable[className][section][b] = new Array(periodsPerDay).fill(null);
      }
      const emptyA = timetable[className][section][a].filter(x => !x).length;
      const emptyB = timetable[className][section][b].filter(x => !x).length;
      return emptyB - emptyA;
    });

    // Attempt to pick teacher + day + period
    for (const day of sortedDays) {
      // Ensure day structure exists
      if (!timetable[className][section][day]) {
        timetable[className][section][day] = new Array(periodsPerDay).fill(null);
      }
      
      // Get random period order but prefer not to place at teacher-preferred-no-last if possible.
      const periods = [...Array(periodsPerDay).keys()].sort(() => Math.random() - 0.5);

      for (const period of periods) {
        if (!timetable[className][section][day] || timetable[className][section][day][period]) continue; // occupied
        // Relax constraints in later attempts
        const allowContinuousSubject = attempt > 25;
        const allowSameSubjectSameDay = attempt > 35;
        
        if (!allowContinuousSubject && this._wouldCreateContinuousSubjectSection(timetable, className, section, day, period, subjectName)) continue;
        if (!allowSameSubjectSameDay && this._sectionDayHasSubject(timetable, className, section, day, subjectName)) continue;

        // choose teacher considering availability and daily limits and preferences
        const candidateTeachers = availableTeachers.filter(tn => {
          // teacher must exist in availability maps
          if (!teacherAvailability[tn] || !teacherAvailability[tn][day]) return false;
          // must be available at that slot
          if (!teacherAvailability[tn][day][period]) return false;
          // must not exceed maxPerDay (but allow some flexibility for last attempts)
          const tObj = teacherMap[tn];
          const currentCount = teacherCountPerDay[tn]?.[day] ?? 0;
          const maxAllowed = (tObj.maxPerDay ?? Infinity);
          // Allow exceeding maxPerDay by 1 if we're in later attempts (more flexible)
          if (currentCount + 1 > maxAllowed + (attempt > 30 ? 1 : 0)) return false;
          return true;
        });

        if (!candidateTeachers.length) continue;

        // Enhanced scoring: Multi-factor optimization
        // Factors: workload balance, teacher preferences, subject distribution
        candidateTeachers.sort((a, b) => {
          const aObj = teacherMap[a], bObj = teacherMap[b];
          
          // Factor 1: Avoid teachers who prefer no last period if this is last period
          const lastPeriodPenaltyA = (aObj.preferNoLastPeriod && period === periodsPerDay - 1) ? 1000 : 0;
          const lastPeriodPenaltyB = (bObj.preferNoLastPeriod && period === periodsPerDay - 1) ? 1000 : 0;
          
          // Factor 2: Workload balance (prefer teachers with fewer periods today)
          const countA = teacherCountPerDay[a][day] ?? 0;
          const countB = teacherCountPerDay[b][day] ?? 0;
          
          // Factor 3: Overall weekly workload balance (prefer teachers with lower total weekly load)
          const weeklyLoadA = this._getTeacherWeeklyLoad(a, teacherCountPerDay, days);
          const weeklyLoadB = this._getTeacherWeeklyLoad(b, teacherCountPerDay, days);
          
          // Factor 4: Subject distribution (prefer teachers who haven't taught this subject today)
          const subjectTodayA = this._hasTeacherTaughtSubjectToday(timetable, className, section, day, subjectName, a);
          const subjectTodayB = this._hasTeacherTaughtSubjectToday(timetable, className, section, day, subjectName, b);
          const subjectPenaltyA = subjectTodayA ? 50 : 0;
          const subjectPenaltyB = subjectTodayB ? 50 : 0;
          
          // Combined score (lower is better)
          const scoreA = countA + lastPeriodPenaltyA + (weeklyLoadA * 0.1) + subjectPenaltyA;
          const scoreB = countB + lastPeriodPenaltyB + (weeklyLoadB * 0.1) + subjectPenaltyB;
          
          return scoreA - scoreB;
        });

        const teacherChosen = candidateTeachers[0];
        if (teacherChosen) {
          // Ensure structure exists before assignment
          if (!timetable[className]) {
            timetable[className] = {};
          }
          if (!timetable[className][section]) {
            timetable[className][section] = {};
          }
          if (!timetable[className][section][day]) {
            timetable[className][section][day] = new Array(periodsPerDay).fill(null);
          }
          
          timetable[className][section][day][period] = { subject: subjectName, teacher: teacherChosen };
          teacherAvailability[teacherChosen][day][period] = false;
          teacherCountPerDay[teacherChosen][day] = (teacherCountPerDay[teacherChosen][day] ?? 0) + 1;
          return true;
        }
      }
    }

    return false;
  }

  _wouldCreateContinuousSubjectSection(timetable, className, section, day, period, subjectName) {
    // disallow same subject back-to-back in same section
    // Ensure structure exists
    if (!timetable[className] || !timetable[className][section] || !timetable[className][section][day]) {
      return false;
    }
    const row = timetable[className][section][day];
    if (!Array.isArray(row)) return false;
    
    if (period > 0) {
      const prev = row[period - 1];
      if (prev && prev.subject === subjectName) return true;
    }
    if (period < row.length - 1) {
      const next = row[period + 1];
      if (next && next.subject === subjectName) return true;
    }
    return false;
  }

  _sectionDayHasSubject(timetable, className, section, day, subjectName) {
    // Ensure structure exists
    if (!timetable[className] || !timetable[className][section] || !timetable[className][section][day]) {
      return false;
    }
    const daySlots = timetable[className][section][day];
    if (!Array.isArray(daySlots)) return false;
    return daySlots.some(slot => slot && slot.subject === subjectName);
  }

  _generateTimeSlots(startTime, endTime, periodDuration, breakDuration, periodsPerDay, breakAfterPeriods = [], lunchAfterPeriod = null, days = []) {
    // build a single-day timeSlots template (same for all days)
    const parseHHMM = (t) => t.split(":").map(Number);
    const [startH, startM] = parseHHMM(startTime);
    let current = new Date();
    current.setHours(startH, startM, 0, 0);

    const slots = [];
    let realPeriodCount = 0;
    for (let i = 0; i < periodsPerDay; i++) {
      realPeriodCount++;
      const periodStart = new Date(current.getTime());
      const periodEnd = new Date(periodStart.getTime() + periodDuration * 60000);

      slots.push({
        type: "period",
        periodIndex: i + 1,
        start_time: periodStart.toTimeString().slice(0, 5),
        end_time: periodEnd.toTimeString().slice(0, 5),
        duration: periodDuration
      });

      current = new Date(periodEnd.getTime());

      // if a lunch is configured after this period (1-based), insert lunch
      if (lunchAfterPeriod === i + 1) {
        const lunchEnd = new Date(current.getTime() + breakDuration * 60000);
        slots.push({
          type: "lunch",
          label: "Lunch",
          start_time: current.toTimeString().slice(0, 5),
          end_time: lunchEnd.toTimeString().slice(0, 5),
          duration: breakDuration
        });
        current = lunchEnd;
      }

      // short breaks after configured periods (1-based)
      if (breakAfterPeriods.includes(i + 1) && i < periodsPerDay - 1) {
        const breakEnd = new Date(current.getTime() + breakDuration * 60000);
        slots.push({
          type: "break",
          label: `Break after P${i + 1}`,
          start_time: current.toTimeString().slice(0, 5),
          end_time: breakEnd.toTimeString().slice(0, 5),
          duration: breakDuration
        });
        current = breakEnd;
      }
    }

    return { dayTemplate: slots, generatedForDays: days.length };
  }

  // Utility deep clone small objects/arrays
  _deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  // Enhanced: Calculate quality metrics for generated timetable
  _calculateQualityMetrics(timetable, classes, teachers, days, periodsPerDay, teacherMap) {
    const metrics = {
      overallScore: 0,
      teacherWorkloadBalance: 0,
      subjectDistribution: 0,
      constraintSatisfaction: 0,
      freePeriods: 0,
      details: {}
    };

    // 1. Teacher Workload Balance (0-100)
    const teacherLoads = {};
    let totalLoad = 0;
    let teacherCount = 0;

    Object.keys(teacherMap).forEach(teacherName => {
      let weeklyLoad = 0;
      days.forEach(day => {
        classes.forEach(c => {
          c.sections.forEach(section => {
            const daySlots = timetable[c.name]?.[section]?.[day] || [];
            daySlots.forEach(slot => {
              if (slot && slot.teacher === teacherName) {
                weeklyLoad++;
              }
            });
          });
        });
      });
      teacherLoads[teacherName] = weeklyLoad;
      totalLoad += weeklyLoad;
      teacherCount++;
    });

    const avgLoad = teacherCount > 0 ? totalLoad / teacherCount : 0;
    let variance = 0;
    Object.values(teacherLoads).forEach(load => {
      variance += Math.pow(load - avgLoad, 2);
    });
    variance = teacherCount > 0 ? variance / teacherCount : 0;
    const stdDev = Math.sqrt(variance);
    
    // Score: 100 if perfect balance, decreases with variance
    // Normalize: max stdDev would be around avgLoad (if one teacher has all)
    const maxStdDev = avgLoad > 0 ? avgLoad : 1;
    metrics.teacherWorkloadBalance = Math.max(0, 100 - (stdDev / maxStdDev) * 100);
    metrics.details.teacherLoads = teacherLoads;
    metrics.details.avgTeacherLoad = avgLoad.toFixed(2);
    metrics.details.workloadStdDev = stdDev.toFixed(2);

    // 2. Subject Distribution (0-100)
    // Check how well subjects are distributed across days (avoid same subject multiple times per day)
    let subjectDistributionScore = 0;
    let totalChecks = 0;
    let goodDistributions = 0;

    classes.forEach(c => {
      c.sections.forEach(section => {
        days.forEach(day => {
          const daySlots = timetable[c.name]?.[section]?.[day] || [];
          const subjectsToday = new Set();
          let hasDuplicate = false;
          
          daySlots.forEach(slot => {
            if (slot && slot.subject) {
              if (subjectsToday.has(slot.subject)) {
                hasDuplicate = true;
              }
              subjectsToday.add(slot.subject);
            }
          });
          
          totalChecks++;
          if (!hasDuplicate) goodDistributions++;
        });
      });
    });

    metrics.subjectDistribution = totalChecks > 0 ? (goodDistributions / totalChecks) * 100 : 100;
    metrics.details.subjectDistributionDetails = {
      totalChecks,
      goodDistributions,
      duplicateSubjectDays: totalChecks - goodDistributions
    };

    // 3. Constraint Satisfaction (0-100)
    // Check: teacher availability, maxPerDay, consecutive subjects
    let constraintViolations = 0;
    let totalConstraints = 0;

    classes.forEach(c => {
      c.sections.forEach(section => {
        days.forEach(day => {
          const daySlots = timetable[c.name]?.[section]?.[day] || [];
          daySlots.forEach((slot, period) => {
            if (slot && slot.teacher) {
              totalConstraints++;
              const teacher = teacherMap[slot.teacher];
              if (teacher) {
                // Check maxPerDay
                const dayCount = Object.values(teacherLoads).reduce((sum, load, idx) => {
                  const tName = Object.keys(teacherLoads)[idx];
                  if (tName === slot.teacher) {
                    // Count this teacher's periods on this day
                    let count = 0;
                    classes.forEach(c2 => {
                      c2.sections.forEach(s2 => {
                        const dSlots = timetable[c2.name]?.[s2]?.[day] || [];
                        dSlots.forEach(s => {
                          if (s && s.teacher === slot.teacher) count++;
                        });
                      });
                    });
                    return count;
                  }
                  return sum;
                }, 0);
                
                if (teacher.maxPerDay !== Infinity && dayCount > teacher.maxPerDay) {
                  constraintViolations++;
                }
              }
            }
          });
        });
      });
    });

    metrics.constraintSatisfaction = totalConstraints > 0 
      ? Math.max(0, 100 - (constraintViolations / totalConstraints) * 100) 
      : 100;
    metrics.details.constraintViolations = constraintViolations;
    metrics.details.totalConstraints = totalConstraints;

    // 4. Free Periods Utilization (0-100)
    // Check how many free periods exist (some free periods are good for flexibility)
    let totalSlots = 0;
    let freeSlots = 0;

    classes.forEach(c => {
      c.sections.forEach(section => {
        days.forEach(day => {
          const daySlots = timetable[c.name]?.[section]?.[day] || [];
          daySlots.forEach(slot => {
            totalSlots++;
            if (!slot || !slot.subject) freeSlots++;
          });
        });
      });
    });

    const freePeriodPercentage = totalSlots > 0 ? (freeSlots / totalSlots) * 100 : 0;
    // Optimal free period percentage is around 5-10%
    const optimalFree = 7.5;
    const freeScore = 100 - Math.abs(freePeriodPercentage - optimalFree) * 5;
    metrics.freePeriods = Math.max(0, Math.min(100, freeScore));
    metrics.details.freeSlots = freeSlots;
    metrics.details.totalSlots = totalSlots;
    metrics.details.freePeriodPercentage = freePeriodPercentage.toFixed(2);

    // 5. Overall Score (weighted average)
    metrics.overallScore = (
      metrics.teacherWorkloadBalance * 0.3 +
      metrics.subjectDistribution * 0.3 +
      metrics.constraintSatisfaction * 0.25 +
      metrics.freePeriods * 0.15
    );

    // Add grade/rating
    if (metrics.overallScore >= 90) metrics.grade = "Excellent";
    else if (metrics.overallScore >= 75) metrics.grade = "Good";
    else if (metrics.overallScore >= 60) metrics.grade = "Fair";
    else metrics.grade = "Needs Improvement";

    return metrics;
  }

  // Helper: Get teacher's weekly load
  _getTeacherWeeklyLoad(teacherName, teacherCountPerDay, days) {
    let total = 0;
    days.forEach(day => {
      total += teacherCountPerDay[teacherName]?.[day] || 0;
    });
    return total;
  }

  // Helper: Check if teacher has taught this subject today
  _hasTeacherTaughtSubjectToday(timetable, className, section, day, subjectName, teacherName) {
    const daySlots = timetable[className]?.[section]?.[day] || [];
    return daySlots.some(slot => 
      slot && 
      slot.teacher === teacherName && 
      slot.subject === subjectName
    );
  }
}
