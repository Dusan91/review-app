const fs = require("fs");
const axios = require("axios");
const simpleGit = require("simple-git");
require("dotenv").config();

const API_KEY = process.env.OPENAI_API_KEY;
const API_URL = "https://api.openai.com/v1/chat/completions";
const git = simpleGit();

// Review rules
const REVIEW_RULES = `
You are a React code reviewer. Follow these strict rules:
1️⃣ Ensure all React components follow best practices.
2️⃣ Check for constants:
   - Constants should be **declared at the top** of the file.
   - Constants should use **UPPER_SNAKE_CASE** naming.
   - Use \`const\` and not \`let\` or \`var\` for constants.
`;

// Get staged files
async function getStagedFiles() {
  const status = await git.status();
  const stagedFiles = status.staged.filter(file => file.endsWith(".js") || file.endsWith(".jsx") || file.endsWith(".ts") || file.endsWith(".tsx"));
  console.log("Staged files:", stagedFiles);  // Log staged files
  return stagedFiles;
}

// Call OpenAI for code review
async function reviewCode(file) {
  const code = fs.readFileSync(file, "utf8");

  console.log(`🔍 Reviewing ${file}...`);

  try {
    const response = await axios.post(
      API_URL,
      {
        model: "gpt-4",
        messages: [
          { role: "system", content: REVIEW_RULES },
          { role: "user", content: `Review this React code. Check if constants are at the top, use UPPER_SNAKE_CASE, and use 'const' not 'let'.\n\n${code}` }
        ],
        max_tokens: 700,
      },
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const review = response.data.choices[0].message.content;
    console.log("Review response:", review);

    // 🚨 Block commit if constants are incorrectly placed or named
    if (review.includes("Constants should be at the top") || review.includes("UPPER_SNAKE_CASE") || review.includes("use `const` and not `let`")) {
      console.log("🚨 Constants violation detected! Fix before committing.");
      process.exit(1); // Prevent commit
    }

    return review;
  } catch (error) {
    console.error(`❌ Failed to review ${file}:`, error.message);
    return null;
  }
}

// Append review to commit message
async function appendReviewToCommit(review) {
  if (!review) return;
  const commitMessage = await git.raw(["log", "-1", "--pretty=%B"]);
  const newCommitMessage = `${commitMessage}\n\n🔍 ChatGPT Code Review:\n${review}`;
  
  await git.commit(newCommitMessage, ["--amend", "--no-edit"]);
  console.log("✅ Code review added to commit message.");
}

// Main function to run the review
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
