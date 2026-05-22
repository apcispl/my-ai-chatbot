import { NextResponse } from "next/server";

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

    /*
    |--------------------------------------------------------------------------
    | FETCH TOOLS FROM MCP SERVER
    |--------------------------------------------------------------------------
    */

    const toolsResponse = await fetch(
      "http://localhost:4001/tools"
    );

    const mcpTools = await toolsResponse.json();

    /*
    |--------------------------------------------------------------------------
    | CONVERT MCP TO OPENAI TOOL FORMAT
    |--------------------------------------------------------------------------
    */

    const tools = mcpTools.map((tool: any) => ({
      type: "function",

      function: {
        name: tool.name,

        description: tool.description,

        parameters: tool.inputSchema,
      },
    }));

    /*
    |--------------------------------------------------------------------------
    | CONVERSATION STATE
    |--------------------------------------------------------------------------
    */

    const conversation: any[] = [
      {
        role: "system",

        content: `
You are a helpful AI assistant.

You have access to external MCP tools.

Rules:
- Use tools whenever realtime or latest information is needed.
- You may use multiple tools.
- Continue tool usage until task is complete.
- Never say you do not have realtime access.
        `,
      },

      ...messages,
    ];

    /*
    |--------------------------------------------------------------------------
    | AGENT LOOP
    |--------------------------------------------------------------------------
    */

    let iterations = 0;

    const MAX_ITERATIONS = 5;

    while (true) {
      iterations++;

      if (iterations > MAX_ITERATIONS) {
        return NextResponse.json({
          reply: "Too many iterations.",
        });
      }

      console.log("FULL CONVERSATION");
      console.log(
        JSON.stringify(conversation, null, 2)
      );

      /*
      |--------------------------------------------------------------------------
      | LLM CALL
      |--------------------------------------------------------------------------
      */

      const response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",

          headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,

            "Content-Type": "application/json",

            "HTTP-Referer":
              "http://localhost:3000",

            "X-Title": "AI Chatbot",
          },

          body: JSON.stringify({
            model: "openai/gpt-4o-mini",

            messages: conversation,

            tools,

            tool_choice: "auto",

            max_tokens: 1000,
          }),
        }
      );

      const data = await response.json();

      console.log("LLM RESPONSE");
      console.log(JSON.stringify(data, null, 2));

      /*
      |--------------------------------------------------------------------------
      | ERROR HANDLING
      |--------------------------------------------------------------------------
      */

      if (data.error) {
        return NextResponse.json({
          reply:
            data.error.message ||
            "LLM request failed.",
        });
      }

      const assistantMessage =
        data?.choices?.[0]?.message;

      if (!assistantMessage) {
        return NextResponse.json({
          reply: "No response from AI.",
        });
      }

      /*
      |--------------------------------------------------------------------------
      | PUSH ASSISTANT MESSAGE
      |--------------------------------------------------------------------------
      */

      conversation.push(assistantMessage);

      const toolCalls =
        assistantMessage.tool_calls;

      /*
      |--------------------------------------------------------------------------
      | FINAL RESPONSE
      |--------------------------------------------------------------------------
      */

      if (
        !toolCalls ||
        toolCalls.length === 0
      ) {
        return NextResponse.json({
          reply: assistantMessage.content,
        });
      }

      /*
      |--------------------------------------------------------------------------
      | EXECUTE ALL TOOL CALLS
      |--------------------------------------------------------------------------
      */

      for (const toolCall of toolCalls) {
        const toolName =
          toolCall.function.name;

        let args = {};

        try {
          args = JSON.parse(
            toolCall.function.arguments ||
              "{}"
          );
        } catch (e) {
          console.error(
            "Invalid tool arguments"
          );
        }

        /*
        |--------------------------------------------------------------------------
        | CALL MCP SERVER
        |--------------------------------------------------------------------------
        */

        try {
          const executeResponse =
            await fetch(
              "http://localhost:4001/execute",
              {
                method: "POST",

                headers: {
                  "Content-Type":
                    "application/json",
                },

                body: JSON.stringify({
                  toolName,
                  args,
                }),
              }
            );

          const executeData =
            await executeResponse.json();

          const toolResult =
            executeData.result;

          console.log("TOOL RESULT");
          console.log(toolResult);

          /*
          |--------------------------------------------------------------------------
          | PUSH TOOL RESULT
          |--------------------------------------------------------------------------
          */

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