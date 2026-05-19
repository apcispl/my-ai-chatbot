import { NextResponse } from "next/server";

const tools = [
  {
    type: "function",
    function: {
      name: "getCurrentTime",
      description: "Get the current server time",
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

    const firstResponse = await fetch(
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

    const firstData = await firstResponse.json();
    // console.log(JSON.stringify(data, null, 2));

    const assistantMessage =
      firstData?.choices?.[0]?.message;
    const toolCalls = assistantMessage?.tool_calls;

    if (toolCalls && toolCalls.length > 0) {
      const toolCall = toolCalls[0];
    
      if (toolCall.function.name === "getCurrentTime") {
        const currentTime = new Date().toString();
    
        const secondResponse = await fetch(
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
                  content: `
                    You are a helpful assistant.
                  `,
                },    
                ...messages,
                assistantMessage,
                {
                  role: "tool",
                  tool_call_id: toolCall.id,
                  content: currentTime,
                },
              ],
            }),
          }
        );
    
        const secondData = await secondResponse.json();
    
        const finalReply =
          secondData?.choices?.[0]?.message?.content;
    
        return NextResponse.json({
          reply: finalReply,
        });
      }
    }
    
    const reply = assistantMessage?.content;
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