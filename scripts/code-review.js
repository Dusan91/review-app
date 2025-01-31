require("dotenv").config();
const axios = require("axios");
const fs = require("fs");
const simpleGit = require("simple-git");

const API_KEY = process.env.OPENAI_API_KEY;
const API_URL = "https://api.openai.com/v1/chat/completions";
const git = simpleGit();

// Read staged files
async function getStagedFiles() {
  const status = await git.status();
  return status.staged.filter(file => file.endsWith(".js") || file.endsWith(".jsx") || file.endsWith(".ts") || file.endsWith(".tsx"));
}

// Call ChatGPT to review code
async function reviewCode(file) {
  const code = fs.readFileSync(file, "utf8");

  console.log(`🔍 Reviewing ${file}...`);

  try {
    const response = await axios.post(
      API_URL,
      {
        model: "gpt-4",
        messages: [
          { role: "system", content: "You are a React expert reviewing code for best practices, performance, and security." },
          { role: "user", content: `Review this React code and provide suggestions:\n\n${code}` }
        ],
        max_tokens: 500,
      },
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    return response.data.choices[0].message.content;
  } catch (error) {
    console.error(`❌ Failed to review ${file}:`, error.message);
    return null;
  }
}

// Append review as commit comments
async function appendReviewToCommit(review) {
  if (!review) return;
  const commitMessage = await git.raw(["log", "-1", "--pretty=%B"]); // Get last commit message
  const newCommitMessage = `${commitMessage}\n\n🔍 ChatGPT Code Review:\n${review}`;
  
  await git.commit(newCommitMessage, ["--amend", "--no-edit"]);
  console.log("✅ Code review added to commit message.");
}

// Main function
async function run() {
  const files = await getStagedFiles();
  if (files.length === 0) {
    console.log("✅ No staged React files found. Skipping review.");
    return;
  }

  let reviewSummary = "";
  for (const file of files) {
    const review = await reviewCode(file);
    if (review) {
      reviewSummary += `\n📄 ${file}:\n${review}\n`;
    }
  }

  if (reviewSummary) {
    console.log(reviewSummary);
    await appendReviewToCommit(reviewSummary);
  }
}

run();
