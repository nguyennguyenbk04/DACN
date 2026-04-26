const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');

const execAsync = promisify(exec);

/**
 * Generate MCQs from transcript text using flan-t5-base + sentence-transformers
 * @param {string} text - transcript text
 * @param {number} numQuestions - number of MCQs to generate
 * @returns {Promise<Array>} array of MCQ objects
 */
async function generateMCQ(text, numQuestions = 5) {
  const venvPython = process.env.VENV_PYTHON || 'python3';

  const scriptPath = path.join(__dirname, '../../scripts/run_mcq_generator.py');
  const inputPath  = `/tmp/mcq_input_${Date.now()}.txt`;
  const outputPath = `/tmp/mcq_output_${Date.now()}.json`;

  try {
    await fs.writeFile(inputPath, text, 'utf8');

    console.log(`Running MCQ generation (${numQuestions} questions)...`);
    const command = `${venvPython} ${scriptPath} ${inputPath} ${outputPath} ${numQuestions}`;
    const { stdout, stderr } = await execAsync(command, { timeout: 300000 }); // 5 min timeout

    if (stdout) console.log('MCQ stdout:', stdout);
    if (stderr) console.error('MCQ stderr:', stderr);

    const resultData = await fs.readFile(outputPath, 'utf8');
    const result = JSON.parse(resultData);

    await fs.unlink(inputPath).catch(() => {});
    await fs.unlink(outputPath).catch(() => {});

    return result.mcqs;
  } catch (error) {
    console.error('MCQ generation error:', error);
    await fs.unlink(inputPath).catch(() => {});
    await fs.unlink(outputPath).catch(() => {});
    throw new Error(`MCQ generation failed: ${error.message}`);
  }
}

module.exports = { generateMCQ };
