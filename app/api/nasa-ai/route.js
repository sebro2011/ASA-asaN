import { GoogleGenAI } from '@google/genai';
import { generateLocalSpaceResponse } from '../../../src/utils/spaceLocalAiEngine.js';

/**
 * NASA AI Route Handler with @google/genai SDK and Trilingual System Instructions
 * Model: 'gemini-2.5-flash'
 */
export async function POST(req) {
  try {
    const body = await req.json();
    const { prompt, message, query, lang = 'en' } = body;
    const userPrompt = (prompt || message || query || '').trim();

    if (!userPrompt) {
      return new Response(JSON.stringify({ error: 'Prompt is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Trilingual System Instructions
    const SYSTEM_INSTRUCTIONS = {
      en: 'You are the official NASA Astrophysics & Deep-Space Exploration AI Assistant. Provide scientifically accurate, inspiring, and accessible answers about NASA missions (ISS, Artemis, James Webb Space Telescope, Mars Rovers, Hubble), astronomy, and cosmology in English.',
      si: 'ඔබ නාසා (NASA) ආයතනයේ නිල තාරකා භෞතික විද්‍යා සහ ගැඹුරු අභ්‍යවකාශ ගවේෂණ සහායකයා වේ. ජාත්‍යන්තර අභ්‍යවකාශ නැවතුම (ISS), ආටෙමිස් මෙහෙයුම, ජේම්ස් වෙබ් දුරේක්ෂය සහ අඟහරු රෝවර පිළිබඳ නිවැරදි විද්‍යාත්මක තොරතුරු ස්වභාවික සිංහල බසින් සපයන්න.',
      ta: 'நீங்கள் நாசாவின் (NASA) அதிகாரப்பூர்வ வானியற்பியல் மற்றும் ஆழ விண்வெளி ஆய்வு நுண்ணறிவு உதவியாளர். சர்வதேச விண்வெளி நிலையம் (ISS), ஆர்ட்டெமிஸ் திட்டம், ஜேம்ஸ் வெப் தொலைநோக்கி மற்றும் செவ்வாய் ரோவர்கள் பற்றிய துல்லியமான அறிவியல் தகவல்களை எளிய மற்றும் தெளிவான தமிழில் வழங்கவும்.'
    };

    const targetInstruction = SYSTEM_INSTRUCTIONS[lang] || SYSTEM_INSTRUCTIONS.en;

    // Use @google/genai SDK if GEMINI_API_KEY is configured
    if (process.env.GEMINI_API_KEY) {
      try {
        const ai = new GoogleGenAI({
          apiKey: process.env.GEMINI_API_KEY,
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build'
            }
          }
        });

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: userPrompt,
          config: {
            systemInstruction: targetInstruction,
            temperature: 0.7
          }
        });

        const text = response.text || '';
        if (text) {
          return new Response(
            JSON.stringify({
              text,
              response: text,
              model: 'gemini-2.5-flash',
              lang
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            }
          );
        }
      } catch (geminiError) {
        console.warn('[Gemini API] Fallback to local intelligence:', geminiError?.message);
      }
    }

    // High-resilience Local Space AI Engine Fallback
    const localResult = generateLocalSpaceResponse(userPrompt, lang);
    return new Response(
      JSON.stringify({
        text: localResult.text,
        response: localResult.text,
        model: 'nasa-local-engine',
        lang: localResult.lang || lang,
        suggestions: localResult.suggestions
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'Internal processing error',
        message: error?.message
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}
