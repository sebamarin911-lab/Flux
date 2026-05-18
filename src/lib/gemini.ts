const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

export interface AIAgendaSummary {
  title: string;
  body: string;
  actionUrl: string;
}

const defaultSummary: AIAgendaSummary = {
  title: 'Recordatorio',
  body: 'Revisa tu agenda de mañana.',
  actionUrl: '/agenda'
};

export async function getNightlySummary(agendaContext: any[]): Promise<AIAgendaSummary> {
  if (!GEMINI_API_KEY) {
    console.warn('No Gemini API Key found. Returning default summary.');
    return defaultSummary;
  }

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.7,
        },
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `Genera un mensaje motivacional de buenas noches que incluya un breve resumen de los eventos de mañana. Eres un asistente amigable de Flux, una app de agenda y bienestar.
Debes retornar estrictamente un objeto JSON con la siguiente estructura y sin formato markdown:
{
  "title": "Un título llamativo (ej. '¡Hora de descansar!')",
  "body": "Mensaje motivacional mencionando algún evento importante si lo hay",
  "actionUrl": "/agenda"
}

Eventos para mañana: ${JSON.stringify(agendaContext.map(e => e.summary))}`
              }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.status}`);
    }

    const data = await response.json();
    const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!resultText) {
      return defaultSummary;
    }

    try {
      const parsed = JSON.parse(resultText);
      return {
        title: parsed.title || defaultSummary.title,
        body: parsed.body || defaultSummary.body,
        actionUrl: parsed.actionUrl || defaultSummary.actionUrl,
      };
    } catch (parseError) {
      console.error('Error parsing Gemini JSON:', parseError);
      return defaultSummary;
    }
  } catch (error) {
    console.error('Gemini API connection error:', error);
    return defaultSummary;
  }
}
