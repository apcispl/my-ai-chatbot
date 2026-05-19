import { NextResponse } from "next/server";

// const tools = [
//   {
//     type: "function",
//     function: {
//       name: "getCurrentTime",
//       description: "Get the current server time",
//       parameters: {
//         type: "object",
//         properties: {},
//       },
//     },
//   },
// ];

const tools = [
  {
    type: "function",
    function: {
      name: "getCurrentTime",
      description:
        "Get ONLY the current server date and time. Use only when user asks specifically about time/date. DO NOT use for weather or other realtime information.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
];

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const messages = body?.messages;

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: "Messages are required" },
        { status: 400 }
      );
    }

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "http://localhost:3000",
          "X-Title": "AI Chatbot",
        },
        body: JSON.stringify({
          model: "openai/gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: "You are a helpful assistant.",
            },
            ...messages,
          ],
          tools,
          tool_choice: "auto",
        }),
      }
    );

    const data = await response.json();
    // console.log(JSON.stringify(data, null, 2));

    const toolCalls = data?.choices?.[0]?.message?.tool_calls;

    if (toolCalls && toolCalls.length > 0) {
      const toolCall = toolCalls[0];
    
      if (toolCall.function.name === "getCurrentTime") {
        const currentTime = new Date().toString();
    
        return NextResponse.json({
          reply: `Current server time is: ${currentTime}`,
        });
      }
    }
    
    const reply = data?.choices?.[0]?.message?.content;
    
    return NextResponse.json({ reply });

    // return NextResponse.json({ reply });
  } catch (err: any) {
    return NextResponse.json(
      {
        error: "Server error",
        details: err.message,
      },
      { status: 500 }
    );
  }
}