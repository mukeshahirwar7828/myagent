const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { GoogleGenAI } = require('@google/genai');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const Papa = require('papaparse');
const xlsx = require('xlsx');

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Configure multer for file uploads
const upload = multer({ dest: 'uploads/' });

// Initialize Google Gemini client
// Note: We use the existing OPENAI_API_KEY environment variable name
// from the user's .env file, but pass it to GoogleGenAI
const ai = new GoogleGenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Create uploads directory if it doesn't exist
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// Chat endpoint with file upload support
app.post('/chat', upload.single('document'), async (req, res) => {
    try {
        let history = [];
        if (req.body.history) {
            try {
                history = JSON.parse(req.body.history);
            } catch (e) {
                console.error("Failed to parse history", e);
                history = [];
            }
        }

        const userMessage = req.body.message || '';
        let fileContextText = '';
        let imagePartData = null;

        if (req.file) {
            try {
                const mimeType = req.file.mimetype;
                const filePath = req.file.path;
                const originalName = req.file.originalname.toLowerCase();

                if (mimeType.startsWith('image/')) {
                    // It's an image, convert to base64 for Gemini inlineData
                    const dataBuffer = fs.readFileSync(filePath);
                    imagePartData = {
                        inlineData: {
                            data: dataBuffer.toString("base64"),
                            mimeType: mimeType
                        }
                    };
                }
                else if (mimeType === 'application/pdf' || originalName.endsWith('.pdf')) {
                    const dataBuffer = fs.readFileSync(filePath);
                    const pdfData = await pdfParse(dataBuffer);
                    fileContextText = pdfData.text;
                }
                else if (originalName.endsWith('.docx')) {
                    const result = await mammoth.extractRawText({ path: filePath });
                    fileContextText = result.value;
                }
                else if (originalName.endsWith('.csv')) {
                    const csvData = fs.readFileSync(filePath, 'utf8');
                    const parsed = Papa.parse(csvData, { header: true });
                    fileContextText = JSON.stringify(parsed.data, null, 2);
                }
                else if (originalName.endsWith('.xlsx') || originalName.endsWith('.xls')) {
                    const workbook = xlsx.readFile(filePath);
                    const sheetName = workbook.SheetNames[0];
                    const sheet = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
                    fileContextText = JSON.stringify(sheet, null, 2);
                }
                else {
                    // Fallback to plain text for everything else (.txt, .md, .js, .json, etc)
                    fileContextText = fs.readFileSync(filePath, 'utf8');
                }
            } catch (e) {
                console.error("Error reading file:", e);
                fileContextText = "[Error processing attached file]";
            } finally {
                // Clear the temporary file
                try {
                    fs.unlinkSync(req.file.path);
                } catch (e) {
                    console.error("Error deleting temp file:", e);
                }
            }
        }

        let combinedContent = userMessage;
        if (fileContextText) {
            combinedContent += `\n\n--- [Attached Document Extract] ---\n${fileContextText.substring(0, 15000)}\n--- [End of Document] ---`;
        }

        if (!combinedContent && !imagePartData && history.length === 0) {
            return res.status(400).json({ error: 'Message or document is required' });
        }

        // Convert the generic history format to Gemini's format
        // Gemini uses 'user' and 'model' as roles in contents
        let formattedContents = [];

        for (const msg of history) {
            if (msg.role === 'user') {
                formattedContents.push({ role: 'user', parts: [{ text: msg.content }] });
            } else if (msg.role === 'assistant' || msg.role === 'model') {
                formattedContents.push({ role: 'model', parts: [{ text: msg.content }] });
            }
        }

        if (combinedContent || imagePartData) {
            let parts = [];
            if (combinedContent) parts.push({ text: combinedContent });
            if (imagePartData) parts.push(imagePartData);
            
            formattedContents.push({ role: 'user', parts: parts });
        }

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: formattedContents,
            config: {
                systemInstruction: "You are Mukesh, a premium and highly intelligent AI assistant. You are helpful, polite, and very smart. If the user uploads a document, its content will be provided in the message prompt. Use it to answer their queries accurately and concisely."
            }
        });

        // Format response back to the generic OpenAI-style structure the frontend expects
        const aiResponse = {
            role: 'assistant',
            content: response.text
        };

        res.json({ message: aiResponse });

    } catch (error) {
        console.error("Error calling Gemini API:", error);
        res.status(500).json({ error: 'Failed to generate response. Please verify your Google API key and try again.' });
    }
});

// Start server
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
