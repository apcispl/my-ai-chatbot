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

  return data.results
    .map((item: any) => {
      return `
      Title: ${item.title}
      Content: ${item.content}
      URL: ${item.url}
      `;
    })
    .join("\n\n");
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
      description: `
      Get the current server date and time.
      Use this tool whenever the user asks:
      - current time
      - today's date
      - current date
      - timezone information
      `,
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
      description: `
      Search the internet for realtime or latest information.
      Use this tool for:
      - weather
      - current events
      - latest news
      - sports results
      - stock prices
      - realtime information
      - live updates
      Always use this tool when realtime information is needed.
      `,
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Internet search query",
          },
        },
        required: ["query"],
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
        {
          error: "Messages are required",
        },
        {
          status: 400,
        }
      );
    }

    const conversation: any[] = [
      {
        role: "system",
        content: `
          You are a helpful AI assistant.
          You have access to tools.
          Rules:
          - Use tools whenever realtime or internet information is required.
          - You may use tools multiple times.
          - Continue tool usage until the task is complete.
          - Never say you do not have realtime access if tools are available.
        `,
      },

      ...messages,
    ];

    let iterations = 0;
    const MAX_ITERATIONS = 5;

    while (true) {
      iterations++;

      if (iterations > MAX_ITERATIONS) {
        return NextResponse.json({
          reply: "Too many tool iterations.",
        });
      }

      // console.log("FULL CONVERSATION");
      // console.log(JSON.stringify(conversation, null, 2));

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
            model: "openai/gpt-4.1-mini",

            messages: conversation,

            tools,

            tool_choice: "auto",
            max_tokens: 1000,
          }),
        }
      );

      const data = await response.json();

      // console.log("LOOP RESPONSE");
      // console.log(JSON.stringify(data, null, 2));

      const assistantMessage =
        data?.choices?.[0]?.message;

      if (!assistantMessage) {
        return NextResponse.json({
          reply: "No response from AI.",
        });
      }

      conversation.push(assistantMessage);

      const toolCalls = assistantMessage.tool_calls;

      // FINAL RESPONSE
      if (!toolCalls || toolCalls.length === 0) {
        return NextResponse.json({
          reply: assistantMessage.content,
        });
      }

      // EXECUTE ALL TOOLS
      for (const toolCall of toolCalls) {
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
          conversation.push({
            role: "tool",
            tool_call_id: toolCall.id,
            name: toolName,
            content: `Tool ${toolName} not found.`,
          });

          continue;
        }

        try {
          const toolResult = await toolFunction(args);

          // console.log("TOOL RESULT");
          // console.log(toolResult);
          
          conversation.push({
            role: "tool",
            tool_call_id: toolCall.id,
            name: toolName,
            content: String(toolResult),
          });
        } catch (error: any) {
          conversation.push({
            role: "tool",
            tool_call_id: toolCall.id,
            name: toolName,
            content: `Tool execution failed: ${error.message}`,
          });
        }
      }
    }
  } catch (err: any) {
    console.error(err);

    return NextResponse.json(
      {
        error: "Server error",
        details: err.message,
      },
      {
        status: 500,
      }
    );
  }
}