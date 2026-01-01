// chatService.js
import dotenv from "dotenv";
dotenv.config();
import { QdrantClient } from "@qdrant/js-client-rest";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { getUserFromToken } from "@/lib/jwt-utils";
import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

// 🔐 Load ENV
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const collectionName = "final";
const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
// 🔗 Qdrant
const qdrantClient = new QdrantClient({
  url: process.env.QDRANT_URL,
  apiKey: process.env.QDRANT_API_KEY,
});

// 🤖 Chat Model
const llm = new ChatGoogleGenerativeAI({
  apiKey: GOOGLE_API_KEY,
  model: "gemini-1.5-flash",
});

// 🔍 Qdrant Query
async function queryQdrant(query: string, topK = 3) {
  const queryEmbedding = await ai.models.embedContent({
    model: "gemini-embedding-exp-03-07",
    contents: query,
    config: {
      taskType: "RETRIEVAL_QUERY",
    },
  });

  if (!queryEmbedding.embeddings || queryEmbedding.embeddings.length === 0) {
  throw new Error("No embeddings returned from the model");
}

const results = await qdrantClient.search(collectionName, {
  vector: queryEmbedding.embeddings[0]?.values ?? [],
  limit: topK,
});

return results.map((hit) => hit.payload?.text);

}

// 💬 Main Chat Function
export async function chat(query: string) {
  const systemMessage = new SystemMessage({
    content: `You are "Package", a friendly, clear, and professional virtual assistant for a package delivery platform.

    Your primary goal is to assist users with their questions related to package delivery—such as sending, tracking, receiving, pricing, and support—while maintaining a calm, helpful, and respectful tone.
    
    You have access to a knowledge base via a Qdrant vector store. This context is retrieved for you and contains the most relevant information about the platform's services, features, policies, and common issues. **Use the context provided to generate accurate and helpful answers.** If the context doesn’t fully answer the user’s question, you may respond based on general platform knowledge, but do not invent specific facts.
    
    Always respond in the **same language the user is using.**
    
    📦 **Areas you can help with include:**
    - Sending a package (steps, requirements, delivery options)
    - Tracking a package (current status, delivery estimate)
    - Delivery issues (delays, wrong address, lost or damaged packages)
    - Pickup & drop-off locations
    - Pricing, weight/size limits, delivery zones
    - Billing, account help, and general technical support
    
    🎯 **Tone & Style Guidelines:**
    - Friendly, clear, and professional
    - Speak in a natural, conversational tone
    - Avoid technical jargon and keep instructions simple
    - Be empathetic and solution-oriented
    
    Remember: You are the customer's helpful partner in navigating their delivery journey confidently and smoothly.
    `,
  });

  const context = (await queryQdrant(query)).join("\n");

  const messages = [
    systemMessage,
    new HumanMessage({
      content: `Context:\n${context}\n\nPlease provide a detailed answer: ${query}`,
    }),
  ];

const response = await llm.invoke(messages) as { content: string };
const responseText = (response.content as string).trim();

  return { response: responseText };
}


export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromToken(req);

    if (!user) {
      console.warn("🔒 Unauthorized access attempt");
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const body = await req.json();
    const { message } = body;

    if (!message) {
      console.warn("⚠️ No query provided in request");
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }

    console.log(`📩 Received query from user ${user.id}: ${message}`);

    const response = await chat(message);
    console.log("✅ Chat response generated successfully");
    return NextResponse.json(response);
  } catch (error) {
    console.error("❌ Error handling POST /chat:", error);
    return NextResponse.json(
      { error: "Erreur interne du serveur" },
      { status: 500 }
    );
  }
}
