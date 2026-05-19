import { NextResponse } from "next/server";



async function getCurrentTime(_: any = {}) {
  return new Date().toString();
}

async function searchInternet({
  query,
}: {
  query: string;
}) {
  const response = await fetch(
    "https://api.tavily.com/search",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query,
        search_depth: "basic",
        max_results: 5,
      }),
    }
  );


  if (!response.ok) {
    throw new Error("Tavily request failed");
  }

  const data = await response.json();

  // return JSON.stringify(data.results);
  return data.results
  .map((item: any) => {
    return `
    Title: ${item.title}
    Content: ${sanitizeText(item.content || "").slice(0, 300)}
    `;
  })
  .join("\n\n");
}

function sanitizeText(text: string) {
  return text
    .replace(/\+?\d[\d\s\-()]{7,}/g, "")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "")
    .trim();
}


const availableTools: Record<string, Function> = {
  getCurrentTime,
  searchInternet,
};

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
  {
    type: "function",
    function: {
      name: "searchInternet",
      description:
        `Search the internet for realtime or latest information.
        Use this tool for:
        - weather
        - current events
        - latest news
        - stock prices
        - sports scores
        - realtime updates
        - live information
        Always use this tool when user asks about current or realtime information.`,
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query",
          },
        },
        required: ["query"],
      },
    },
  }
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

    if (!firstResponse.ok) {
      const errorText = await firstResponse.text();
    
      // console.error(errorText);
    
      throw new Error("First LLM call failed");
    }

    const firstData = await firstResponse.json();
    // console.log(JSON.stringify(data, null, 2));

    // console.log("FIRST DATA");
    // console.log(JSON.stringify(firstData, null, 2));

    const assistantMessage =
      firstData?.choices?.[0]?.message;
    const toolCalls = assistantMessage?.tool_calls;

    if (toolCalls && toolCalls.length > 0) {
      
      const toolCall = toolCalls[0];

      const toolName = toolCall.function.name;

      let args = {};

      try {
        args = JSON.parse(
          toolCall.function.arguments || "{}"
        );
      } catch (e) {
        console.error("Invalid tool arguments");
      }

      const toolFunction = availableTools[toolName];

      if (!toolFunction) {
        return NextResponse.json({
          reply: `Tool ${toolName} not found.`,
        });
      }

      const toolResult = await toolFunction(args)

      // console.log(toolResult)
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
                content: `You are a helpful AI assistant.
                You have access to external tools.
                For:
                - weather
                - realtime information
                - current events
                - latest news
                - live data
                you MUST use tools instead of answering from memory.
                Never say you do not have realtime access when tools are available.`,
              },
      
              ...messages,
      
              assistantMessage,
      
              {
                role: "tool",
                tool_call_id: toolCall.id,
                name: toolName,
                content: toolResult,
              },
            ],
          }),
        }
      );

      if (!secondResponse.ok) {
        const errorText = await secondResponse.text();
      
        // console.error(errorText);
      
        throw new Error("Second LLM call failed");
      }
      
      const secondData = await secondResponse.json();

      // console.log("SECOND DATA");
      // console.log(JSON.stringify(secondData, null, 2));
      
      const finalReply =
        secondData?.choices?.[0]?.message?.content;
      
      return NextResponse.json({
        reply: finalReply,
      });

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