module.exports = [
  {
    files: ["**/*.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[object.name='openai'][property.name='chat']",
          message: "Direct OpenAI calls are forbidden outside llm-router-service/. Use the MCP layer."
        },
        {
          selector: "CallExpression[callee.property.name='create'][callee.object.property.name='completions']",
          message: "Direct OpenAI completions.create() is forbidden outside llm-router-service/. Use the MCP layer."
        },
        {
          selector: "CallExpression[callee.property.name='generateContent']",
          message: "Direct Gemini generateContent() is forbidden outside llm-router-service/. Use the MCP layer."
        }
      ]
    }
  },
  {
    files: ["services/llm-router-service/**/*.ts"],
    rules: {
      "no-restricted-syntax": "off"
    }
  }
];
