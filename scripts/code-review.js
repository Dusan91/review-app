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
const REVIEW_RULES = `
You are a React code reviewer. Follow these strict rules:
1️⃣ Ensure all React components follow best practices.
2️⃣ Optimize performance by avoiding unnecessary re-renders.
3️⃣ Check for security risks such as unsafe use of "dangerouslySetInnerHTML".
4️⃣ Enforce consistent naming conventions for variables and functions.
5️⃣ Suggest improvements for better state management (e.g., useReducer over useState when needed).
6️⃣ Validate that hooks follow the rules of hooks and are used properly.
7️⃣ Identify unnecessary dependencies or re-renders in useEffect.
8️⃣ Ensure components are modular and follow the Single Responsibility Principle (SRP).
9️⃣ Recommend better ways to handle async operations (e.g., using React Query or SWR).
🔟 Highlight any accessibility (a11y) issues in JSX (e.g., missing alt attributes in images).
`;

async function reviewCode(file) {
  const code = fs.readFileSync(file, "utf8");

  console.log(`🔍 Reviewing ${file}...`);

  try {
    const response = await axios.post(
      API_URL,
      {
        model: "gpt-4",
        messages: [
          { role: "system", content: REVIEW_RULES },  // Custom rules
          { role: "user", content: `Review this React code based on the above rules:\n\n${code}` }
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
