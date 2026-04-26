const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');

const execAsync = promisify(exec);

/**
 * Summarize transcript text using your trained Pegasus model
 */
async function summarizeWithPegasus(text, maxLen = 150, minLen = 40) {
  const venvPython = process.env.VENV_PYTHON || 'python3';
  
  const scriptPath = path.join(__dirname, '../../scripts/run_pegasus_summarizer.py');
  const inputPath = `/tmp/summarize_input_${Date.now()}.txt`;
  const outputPath = `/tmp/summarize_output_${Date.now()}.json`;
  
  try {
    // Write input text to file
    await fs.writeFile(inputPath, text, 'utf8');
    
    // Run Pegasus summarizer, passing max/min length as CLI args
    console.log('Running Pegasus summarization...');
    const command = `${venvPython} ${scriptPath} ${inputPath} ${outputPath} ${maxLen} ${minLen}`;
    const { stdout, stderr } = await execAsync(command, { timeout: 180000 }); // 3 min timeout
    
    if (stdout) console.log('Pegasus stdout:', stdout);
    if (stderr) console.error('Pegasus stderr:', stderr);
    
    // Read result
    const resultData = await fs.readFile(outputPath, 'utf8');
    const result = JSON.parse(resultData);
    
    // Cleanup
    await fs.unlink(inputPath);
    await fs.unlink(outputPath);
    
    return result.summary;
  } catch (error) {
    console.error('Pegasus summarization error:', error);
    // Cleanup on error
    try {
      await fs.unlink(inputPath);
      await fs.unlink(outputPath);
    } catch (e) { /* ignore */ }
    
    throw new Error(`Pegasus summarization failed: ${error.message}`);
  }
}

module.exports = {
  summarizeWithPegasus
};
