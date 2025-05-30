import nodemailer from "nodemailer";
import dotenv from 'dotenv'
dotenv.config()

const webiseUrl = process.env.WEBSITE_URL

export const sendEmail = async (to: string, subject: string, text: string) => {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
  });

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to,
    subject,
    html: text,
  };
  
  try {
    await transporter.sendMail(mailOptions);
    console.log("Email sent successfully");
  } catch (error) {
    console.error("Error sending email:", error);
  }
};

export const defaultMemberEmail = (organisation_name: string, name: string): string => {
  return `
  <div style="background:#f4f4f7;padding:30px 0;min-height:100vh;font-family:Arial,sans-serif;">
    <div style="max-width:480px;margin:40px auto;background:#fff;border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,0.08);overflow:hidden;">
      <div style="background:#5B96A5;padding:24px 0;text-align:center;color:#fff;">
        <h2 style="margin:0;font-size:2rem;letter-spacing:1px;">RemoteStar</h2>
      </div>
      <div style="padding:32px 24px 24px 24px;">
        <p style="font-size:1.1rem;margin-bottom:18px;">Hello <b>${name}</b>,</p>
        <p style="font-size:1rem;margin-bottom:14px;">You have been <b>added as a member</b> to the organisation <b>${organisation_name}</b>.</p>
        <p style="font-size:1rem;margin-bottom:18px;">Please login to the platform to view the organisation and start using the platform.</p>
        <a href="${process.env.WEBSITE_URL}/login" style="display:inline-block;margin:18px 0 0 0;padding:12px 28px;background:#5B96A5;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;font-size:1rem;">Login to RemoteStar</a>
        <p style="margin-top:32px;font-size:0.95rem;color:#888;">Thank you,<br>The Team</p>
      </div>
      <div style="background:#f4f4f7;padding:16px;text-align:center;font-size:0.9rem;color:#aaa;">
        &copy; ${new Date().getFullYear()} RemoteStar. All rights reserved.
      </div>
    </div>
  </div>
  `;
};

export const defaultAdminEmail = (organisation_name: string, name: string): string => {
  return `
  <div style="background:#f4f4f7;padding:30px 0;min-height:100vh;font-family:Arial,sans-serif;">
    <div style="max-width:480px;margin:40px auto;background:#fff;border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,0.08);overflow:hidden;">
      <div style="background:#5B96A5;padding:24px 0;text-align:center;color:#fff;">
        <h2 style="margin:0;font-size:2rem;letter-spacing:1px;">RemoteStar</h2>
      </div>
      <div style="padding:32px 24px 24px 24px;">
        <p style="font-size:1.1rem;margin-bottom:18px;">Hello <b>${name}</b>,</p>
        <p style="font-size:1rem;margin-bottom:14px;">You have been <b>added as an admin</b> to the organisation <b>${organisation_name}</b>.</p>
        <p style="font-size:1rem;margin-bottom:18px;">Please login to the platform to view the organisation and start using the platform.</p>
        <a href="${process.env.WEBSITE_URL}/login" style="display:inline-block;margin:18px 0 0 0;padding:12px 28px;background:#5B96A5;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;font-size:1rem;">Login to RemoteStar</a>
        <p style="margin-top:32px;font-size:0.95rem;color:#888;">Thank you,<br>The Team</p>
      </div>
      <div style="background:#f4f4f7;padding:16px;text-align:center;font-size:0.9rem;color:#aaa;">
        &copy; ${new Date().getFullYear()} RemoteStar. All rights reserved.
      </div>
    </div>
  </div>
  `;
};