// utils/fee.helper.js

import FeePayment from "../models/feePayment.model.js";

export const getTotalPaid = async (studentId, academicYear) => {
  const result = await FeePayment.aggregate([
    { $match: { student: studentId, academicYear, status: "paid" } },
    { $group: { _id: null, totalPaid: { $sum: "$amountPaid" } } }
  ]);
  return result[0]?.totalPaid || 0;
};
