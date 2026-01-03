import AdmissionApplication from '../models/admission.model.js';
import cloudinary from '../lib/cloudinary.js';
import { redis } from '../lib/redis.js';
import { sendEmail } from '../utils/emailService.js';
import { sendWhatsApp } from '../utils/sendWhatsApp.js';
import xlsx from 'xlsx';

export const createApplication = async (req, res) => {
  try {
    const {
      studentName,
      dateOfBirth,
      gender,
      grade,
      parentName,
      parentEmail,
      parentPhone,
      address,
      previousSchool,
      medicalConditions,
      documents = {}
    } = req.body;

    let uploadedDocs = {};

    const docKeys = Object.keys(documents);

    if (docKeys.length > 0) {
      const uploadPromises = docKeys.map(async (key) => {
        const result = await cloudinary.uploader.upload(documents[key], {
          folder: "admissions",
        });
        uploadedDocs[key] = result.secure_url;
      });

      await Promise.all(uploadPromises);
    }

    const app = await AdmissionApplication.create({
      studentName,
      dateOfBirth,
      gender,
      grade,
      parentName,
      parentEmail,
      parentPhone,
      address,
      previousSchool,
      medicalConditions,
      documents: uploadedDocs,
      status: 'submitted', // Set initial status
    });

    // Send email notification to parent
    try {
      await sendEmailWithAttachment({
        to: parentEmail,
        subject: `Admission Application Received - ${studentName}`,
        html: `
          <h2>Admission Application Received</h2>
          <p>Dear ${parentName},</p>
          <p>Thank you for submitting the admission application for <strong>${studentName}</strong>.</p>
          <p><strong>Application Details:</strong></p>
          <ul>
            <li><strong>Student Name:</strong> ${studentName}</li>
            <li><strong>Grade:</strong> ${grade}</li>
            <li><strong>Application ID:</strong> ${app._id}</li>
            <li><strong>Submission Date:</strong> ${new Date().toLocaleDateString()}</li>
          </ul>
          <p>We have received your application and will review it shortly. You will be contacted with further instructions.</p>
          <br/>
          <p>Regards,<br/>School Administration</p>
        `
      });
    } catch (emailError) {
      console.error("Failed to send email notification:", emailError);
    }

    // Send WhatsApp notification to parent
    try {
      await sendWhatsApp({
        to: parentPhone,
        message: `Dear ${parentName}, thank you for submitting the admission application for ${studentName} (Grade: ${grade}). Application ID: ${app._id}. We will review and contact you soon. - School Administration`
      });
    } catch (whatsappError) {
      console.error("Failed to send WhatsApp notification:", whatsappError);
    }

    await updateApplicationsCache();
    res.status(201).json(app);
  } catch (error) {
    console.error("Error in createApplication:", error);
    res.status(500).json({ message: "Failed to submit application", error: error.message });
  }
};

export const getAllApplications = async (req, res) => {
  try {
    let cached = await redis.get("all_applications");
    if (cached) return res.json(JSON.parse(cached));

    const applications = await AdmissionApplication.find().sort({ createdAt: -1 }).lean();
    await redis.set("all_applications", JSON.stringify(applications));
    res.json(applications);
  } catch (error) {
    console.error("Error in getAllApplications:", error);
    res.status(500).json({ message: "Failed to fetch applications", error: error.message });
  }
};

export const getApplicationById = async (req, res) => {
  try {
    const app = await AdmissionApplication.findById(req.params.id);
    if (!app) return res.status(404).json({ message: "Application not found" });
    res.json(app);
  } catch (error) {
    console.error("Error in getApplicationById:", error);
    res.status(500).json({ message: "Error fetching application", error: error.message });
  }
};

async function updateApplicationsCache() {
  try {
    const applications = await AdmissionApplication.find().sort({ createdAt: -1 }).lean();
    await redis.set("all_applications", JSON.stringify(applications));
  } catch (error) {
    console.log("Error updating applications cache:", error.message);
  }
}

export const reviewApplication = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reviewNotes } = req.body;

    const application = await AdmissionApplication.findById(id);
    if (!application) {
      return res.status(404).json({ message: "Application not found" });
    }

    // Update application status
    application.status = status;
    if (reviewNotes) {
      application.reviewNotes = reviewNotes;
    }
    application.reviewedAt = new Date();
    application.reviewedBy = req.user?.id || 'admin';

    await application.save();

    // Send notifications based on status
    if (status === 'accepted') {
      try {
        // Send acceptance email
        await sendEmail({
          to: application.parentEmail,
          subject: `🎉 Admission Application Approved - ${application.studentName}`,
          html: `
            <h2>🎉 Congratulations! Your Application Has Been Approved</h2>
            <p>Dear ${application.parentName},</p>
            <p>We are delighted to inform you that the admission application for <strong>${application.studentName}</strong> has been <span style="color: green; font-weight: bold;">APPROVED</span>!</p>
            
            <div style="background-color: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3>Application Details:</h3>
              <ul>
                <li><strong>Student Name:</strong> ${application.studentName}</li>
                <li><strong>Grade:</strong> ${application.grade}</li>
                <li><strong>Application ID:</strong> ${application._id}</li>
                <li><strong>Approval Date:</strong> ${new Date().toLocaleDateString()}</li>
              </ul>
            </div>

            <h3>Next Steps:</h3>
            <ol>
              <li>Complete the enrollment process within 7 days</li>
              <li>Submit any remaining documents</li>
              <li>Pay the enrollment fee</li>
              <li>Attend the orientation session</li>
            </ol>

            <p>Our admissions team will contact you shortly with detailed instructions for the next steps.</p>
            
            <p style="color: #666; font-size: 14px;">
              If you have any questions, please don't hesitate to contact us at admissions@EduReach.com
            </p>
            
            <br/>
            <p>Best regards,<br/>EduReach Admissions Team</p>
          `
        });

        // Send acceptance WhatsApp message
        await sendWhatsApp({
          to: application.parentPhone,
          message: `🎉 Congratulations! The admission application for ${application.studentName} (Grade: ${application.grade}) has been APPROVED! Application ID: ${application._id}. Our team will contact you within 24 hours with next steps. - EduReach Admissions`
        });
      } catch (notificationError) {
        console.error("Failed to send acceptance notifications:", notificationError);
      }
    } else if (status === 'rejected') {
      try {
        // Send rejection email
        await sendEmail({
          to: application.parentEmail,
          subject: `Admission Application Update - ${application.studentName}`,
          html: `
            <h2>Admission Application Update</h2>
            <p>Dear ${application.parentName},</p>
            <p>Thank you for your interest in EduReach. We regret to inform you that the admission application for <strong>${application.studentName}</strong> has not been approved at this time.</p>
            
            <div style="background-color: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3>Application Details:</h3>
              <ul>
                <li><strong>Student Name:</strong> ${application.studentName}</li>
                <li><strong>Grade:</strong> ${application.grade}</li>
                <li><strong>Application ID:</strong> ${application._id}</li>
                <li><strong>Review Date:</strong> ${new Date().toLocaleDateString()}</li>
              </ul>
            </div>

            ${reviewNotes ? `
            <h3>Review Notes:</h3>
            <p style="background-color: #f9f9f9; padding: 15px; border-radius: 5px;">${reviewNotes}</p>
            ` : ''}

            <p>We encourage you to:</p>
            <ul>
              <li>Review the application requirements</li>
              <li>Consider applying for future academic sessions</li>
              <li>Contact our admissions team for guidance</li>
            </ul>

            <p style="color: #666; font-size: 14px;">
              For any questions, please contact us at admissions@EduReach.com
            </p>
            
            <br/>
            <p>Best regards,<br/>EduReach Admissions Team</p>
          `
        });

        // Send rejection WhatsApp message
        await sendWhatsApp({
          to: application.parentPhone,
          message: `Thank you for your interest in EduReach. The admission application for ${application.studentName} (Grade: ${application.grade}) has not been approved. Application ID: ${application._id}. Please check your email for details. - EduReach Admissions`
        });
      } catch (notificationError) {
        console.error("Failed to send rejection notifications:", notificationError);
      }
    }

    await updateApplicationsCache();
    res.json({ message: "Application reviewed successfully", application });
  } catch (error) {
    console.error("Error in reviewApplication:", error);
    res.status(500).json({ message: "Failed to review application", error: error.message });
  }
};

// Export accepted students to Excel
export const exportAcceptedStudentsToExcel = async (req, res) => {
  try {
    // Get all accepted applications
    const acceptedApplications = await AdmissionApplication.find({ 
      status: 'accepted' 
    }).sort({ createdAt: -1 });

    if (acceptedApplications.length === 0) {
      return res.status(404).json({ 
        message: "No accepted students found to export" 
      });
    }

    // Prepare data for Excel - match the upload structure
    const excelData = acceptedApplications.map((app) => {
      // Format date of birth as string (YYYY-MM-DD format for Excel)
      const dob = app.dateOfBirth ? new Date(app.dateOfBirth).toISOString().split('T')[0] : '';
      
      return {
        'Student Name': app.studentName || '',
        'Date of Birth': dob,
        'Gender': app.gender || '',
        'Grade': app.grade || '',
        'Parent Name': app.parentName || '',
        'Parent Email': app.parentEmail || '',
        'Parent Phone': app.parentPhone || '',
        'Address': app.address || '',
        'Previous School': app.previousSchool || '',
        'Medical Conditions': app.medicalConditions || '',
        'Application ID': app._id.toString(),
        'Accepted Date': app.reviewedAt ? new Date(app.reviewedAt).toISOString().split('T')[0] : ''
      };
    });

    // Create workbook and worksheet
    const workbook = xlsx.utils.book_new();
    const worksheet = xlsx.utils.json_to_sheet(excelData);

    // Set column widths
    const columnWidths = [
      { wch: 20 }, // Student Name
      { wch: 12 }, // Date of Birth
      { wch: 10 }, // Gender
      { wch: 10 }, // Grade
      { wch: 20 }, // Parent Name
      { wch: 25 }, // Parent Email
      { wch: 15 }, // Parent Phone
      { wch: 30 }, // Address
      { wch: 25 }, // Previous School
      { wch: 25 }, // Medical Conditions
      { wch: 25 }, // Application ID
      { wch: 15 }  // Accepted Date
    ];
    worksheet['!cols'] = columnWidths;

    // Add worksheet to workbook
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Accepted Students');

    // Generate Excel file buffer
    const excelBuffer = xlsx.write(workbook, { 
      type: 'buffer', 
      bookType: 'xlsx' 
    });

    // Set response headers for file download
    const fileName = `Accepted_Students_${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', excelBuffer.length);

    // Send the file
    res.send(excelBuffer);
  } catch (error) {
    console.error("Error in exportAcceptedStudentsToExcel:", error);
    res.status(500).json({ 
      message: "Failed to export accepted students", 
      error: error.message 
    });
  }
};
