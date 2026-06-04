/**
 * Example MCP server — exposes two weather tools.
 * Run with: tsx examples/weather-server/server.ts
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const DB: Record<string, { temp: number; condition: string; humidity: number }> = {
  london:   { temp: 18, condition: 'partly cloudy', humidity: 72 },
  paris:    { temp: 22, condition: 'sunny',          humidity: 55 },
  tokyo:    { temp: 28, condition: 'humid',          humidity: 85 },
  'new york': { temp: 15, condition: 'windy',        humidity: 60 },
};

const server = new Server(
  { name: 'weather-server', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'get_current_weather',
      description: 'Get the current weather for a city',
      inputSchema: {
        type: 'object',
        properties: {
          city:  { type: 'string', description: 'City name' },
          units: { type: 'string', enum: ['celsius', 'fahrenheit'], default: 'celsius' },
        },
        required: ['city'],
      },
    },
    {
      name: 'get_forecast',
      description: 'Get a multi-day weather forecast for a city',
      inputSchema: {
        type: 'object',
        properties: {
          city: { type: 'string', description: 'City name' },
          days: { type: 'integer', minimum: 1, maximum: 7, default: 3 },
        },
        required: ['city'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  if (name === 'get_current_weather') {
    const city  = (args.city as string).toLowerCase();
    const units = (args.units as string | undefined) ?? 'celsius';
    const data  = DB[city];

    if (!data) {
      return {
        content: [{ type: 'text', text: `No weather data for "${args.city as string}"` }],
        isError: true,
      };
    }

    const temp = units === 'fahrenheit' ? Math.round(data.temp * 1.8 + 32) : data.temp;
    const unit = units === 'fahrenheit' ? '°F' : '°C';

    return {
      content: [
        {
          type: 'text',
          text: `Current weather in ${args.city as string}: ${data.condition}, temperature ${temp}${unit}, humidity ${data.humidity}%`,
        },
      ],
    };
  }

  if (name === 'get_forecast') {
    const city = (args.city as string).toLowerCase();
    const days = (args.days as number | undefined) ?? 3;
    const data = DB[city];

    if (!data) {
      return {
        content: [{ type: 'text', text: `No weather data for "${args.city as string}"` }],
        isError: true,
      };
    }

    const lines = Array.from({ length: days }, (_, i) => {
      const delta = Math.round((Math.random() - 0.5) * 6);
      return `Day ${i + 1}: ${data.condition}, ${data.temp + delta}°C`;
    });

    return {
      content: [
        {
          type: 'text',
          text: `${days}-day forecast for ${args.city as string}:\n${lines.join('\n')}`,
        },
      ],
    };
  }

  throw new Error(`Unknown tool: ${name}`);
});

await server.connect(new StdioServerTransport());
