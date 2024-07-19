// Importa las bibliotecas necesarias
const express = require('express');
const bodyParser = require('body-parser');
const multer = require('multer');
const fs = require('fs');
const pdf = require('pdf-parse');
// Importa la biblioteca de Google Generative AI
const { GoogleGenerativeAI } = require("@google/generative-ai"); 
const session = require('express-session'); // Importa la biblioteca de sesiones

// Define la API key de Google Generative AI
const API_KEY = 'AIzaSyA3fu1Z4182uWsdTF4ewVqupfhyT_I2lo0';

// Crea una instancia de Google Generative AI con la API key
const genAI = new GoogleGenerativeAI(API_KEY);

// Crea una instancia de la aplicación Express
const app = express();

// Define el puerto del servidor
const PORT = 3000;

// Configura multer para manejar archivos subidos
const upload = multer({ dest: 'uploads/' });

// Configura el middleware para analizar los cuerpos de las solicitudes JSON
app.use(bodyParser.json());

// Define la carpeta pública para servir archivos estáticos
app.use(express.static('public'));

// Configura las sesiones para mantener el historial de la conversación
app.use(session({
  secret: 'your_secret_key', // Reemplaza con tu propia clave secreta
  resave: false,
  saveUninitialized: true
}));

// Función para procesar un archivo subido
async function processFile(file) {
  // Obtén el tipo MIME del archivo
  const mimeType = file.mimetype;

  // Obtén la ruta del archivo
  const filePath = file.path;

  // Si el archivo es un PDF, extrae el texto
  if (mimeType === 'application/pdf') {
    return await extractTextFromPDF(filePath);
  } 
  // Si el archivo es una imagen, interpreta la imagen con Gemini
  else if (mimeType.startsWith('image/')) {
    return await interpretImageWithGemini(filePath, mimeType);
  } 
  // Si el archivo no es un PDF ni una imagen, devuelve un mensaje de error
  else {
    return 'Tipo de archivo no soportado';
  }
}

// Función para extraer texto de un archivo PDF
async function extractTextFromPDF(filePath) {
  // Lee el contenido del archivo PDF
  const dataBuffer = fs.readFileSync(filePath);

  // Utiliza la biblioteca `pdf-parse` para extraer el texto del PDF
  const data = await pdf(dataBuffer);

  // Devuelve el texto extraído
  return data.text;
}

// Función para interpretar una imagen con el modelo Gemini
async function interpretImageWithGemini(filePath, mimeType) {
  try {
    // Obtén el modelo Gemini-1.5-flash
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // Lee el contenido de la imagen
    const imageData = fs.readFileSync(filePath);

    // Crea un array con los datos de la imagen para enviar al modelo Gemini
    const imageParts = [
      {
        inlineData: {
          data: imageData.toString("base64"),
          mimeType: mimeType
        }
      }
    ];

    // Genera un prompt para el modelo Gemini que incluye una solicitud para describir la imagen
    const result = await model.generateContent(["Describe detalladamente lo que ves en esta imagen.", ...imageParts]);

    // Devuelve el texto generado por el modelo Gemini
    return result.response.text();
  } catch (error) {
    // Maneja los errores que ocurran durante la interpretación de la imagen
    console.error('Error interpretando imagen:', error);
    return 'Error al interpretar la imagen';
  }
}

// Función para obtener una respuesta de Gemini Chat
async function getGeminiChatCompletion(sessionId, userMessage, fileContents) {
  try {
    // Obtén el modelo Gemini-1.5-flash
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // Obtén el historial de la sesión actual
    const sessionHistory = sessionStore[sessionId] || [];

    // Crea un prompt para el modelo Gemini que incluye el historial de la sesión y el mensaje del usuario
    let prompt = sessionHistory.map(({ role, content }) => `${role}: ${content}`).join('\n');
    prompt += `\nuser: ${userMessage}`;

    // Agrega los contenidos de los archivos subidos al prompt
    if (Object.keys(fileContents).length > 0) {
      prompt += "\n\nContexto adicional de archivos cargados:\n";
      for (let [fileName, content] of Object.entries(fileContents)) {
        prompt += `\nContenido del archivo ${fileName}:\n${content}\n`;
      }
    }

    // Resumir el historial si es necesario (para evitar exceder el límite de tokens)
    const tokenLimit = 1000000; // Ajusta este valor según el límite de tokens de tu modelo
    while (tokenize(prompt).length > tokenLimit) {
      sessionHistory.shift(); // Elimina los mensajes más antiguos
      prompt = sessionHistory.map(({ role, content }) => `${role}: ${content}`).join('\n');
      prompt += `\nuser: ${userMessage}`;
      if (Object.keys(fileContents).length > 0) {
        prompt += "\n\nContexto adicional de archivos cargados:\n";
        for (let [fileName, content] of Object.entries(fileContents)) {
          prompt += `\nContenido del archivo ${fileName}:\n${content}\n`;
        }
      }
    }

    // Genera una respuesta con el modelo Gemini
    const result = await model.generateContent(prompt);

    // Devuelve la respuesta del modelo Gemini
    return result.response.text();
  } catch (error) {
    // Maneja los errores que ocurran durante la obtención de la respuesta de Gemini
    console.error('Error en getGeminiChatCompletion:', error);

    // Si el error es debido a una API key inválida, devuelve un mensaje de error específico
    if (error.message.includes('API key not valid')) {
      return 'Error: La API key no es válida. Por favor, verifica tu configuración.';
    }

    // Devuelve un mensaje de error general
    return 'Lo siento, hubo un error al procesar tu solicitud. Por favor, intenta de nuevo más tarde.';
  }
}

// Función para contar tokens (ajusta según la implementación de tu modelo)
function tokenize(text) {
  // Divide el texto en tokens (palabras)
  return text.split(/\s+/);
}

// Almacena el historial de las conversaciones
let sessionStore = {};

// Define la ruta `/chat` para manejar las solicitudes de chat
app.post('/chat', upload.array('files'), async (req, res) => {
  // Obtén el ID de la sesión actual
  const sessionId = req.sessionID;

  // Obtén el mensaje del usuario
  const userMessage = req.body.message || '';

  // Obtén los archivos subidos
  const files = req.files || [];

  // Si no hay historial de la sesión actual, inicializa un array vacío
  if (!sessionStore[sessionId]) {
    sessionStore[sessionId] = [];
  }

  try {
    // Inicializa un objeto vacío para almacenar los contenidos de los archivos
    let fileContents = {};

    // Procesa cada archivo subido
    for (let file of files) {
      // Extrae el contenido del archivo y guárdalo en el objeto `fileContents`
      const content = await processFile(file);
      fileContents[file.originalname] = content;

      // Elimina el archivo temporal de la carpeta `uploads`
      fs.unlinkSync(file.path);
    }

    // Verifica el límite de tokens antes de agregar nuevos contenidos al historial
    let currentTokenCount = tokenize(sessionStore[sessionId].map(({ role, content }) => `${role}: ${content}`).join('\n')).length;

    // Agrega los contenidos de los archivos al historial si no se excede el límite de tokens
    for (let [fileName, content] of Object.entries(fileContents)) {
      let contentTokens = tokenize(content).length;
      if (currentTokenCount + contentTokens <= 1000000) {
        currentTokenCount += contentTokens;
        sessionStore[sessionId].push({ role: 'file', content: `Contenido del archivo ${fileName}:\n${content}` });
      } else {
        break;
      }
    }

    // Obtén la respuesta del chatbot con Gemini Chat
    const botMessage = await getGeminiChatCompletion(sessionId, userMessage, fileContents);

    // Actualiza el historial de la conversación con el mensaje del usuario y la respuesta del chatbot
    sessionStore[sessionId].push({ role: 'user', content: userMessage });
    sessionStore[sessionId].push({ role: 'bot', content: botMessage });

    // Devuelve la respuesta del chatbot al cliente
    res.json({ message: botMessage });
  } catch (error) {
    // Maneja los errores que ocurran durante el procesamiento de la solicitud de chat
    console.error('Error en /chat:', error);
    res.status(500).json({ error: 'Error interno del servidor. Por favor, intenta de nuevo más tarde.' });
  }
});

// Inicia el servidor Express
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});