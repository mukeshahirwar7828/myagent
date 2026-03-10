const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { GoogleGenAI } = require('@google/genai');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const pdfParse = require('pdf-parse');

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
        let fileContext = '';

        if (req.file) {
            try {
                if (req.file.mimetype === 'application/pdf') {
                    const dataBuffer = fs.readFileSync(req.file.path);
                    const pdfData = await pdfParse(dataBuffer);
                    fileContext = pdfData.text;
                } else {
                    fileContext = fs.readFileSync(req.file.path, 'utf8');
                }
            } catch (e) {
                console.error("Error reading file:", e);
                fileContext = "[Error extracting text from document]";
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
        if (fileContext) {
            combinedContent += `\n\n--- [Attached Document] ---\n${fileContext}\n--- [End of Document] ---`;
        }

        if (!combinedContent && history.length === 0) {
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

        if (combinedContent) {
            formattedContents.push({ role: 'user', parts: [{ text: combinedContent }] });
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
