/**
 * Static (built-in and function) tool definitions for the tool catalog.
 *
 * Pure data extracted from toolManager.ts so the catalog contents live in one
 * place, separate from catalog mutation, preference, and MCP-availability logic.
 */
import type { ToolDefinition, ToolEntry } from "../../../types/tools.ts";

/** The built-in and function tool entries seeded into the catalog at load. */
export const STATIC_TOOLS: ToolEntry[] = [
  {
    key: "function:open_meteo_forecast",
    type: "function",
    displayName: "Weather (Open-Meteo)",
    description: "Fetch 1-7 day forecasts using the Open-Meteo API.",
    defaultEnabled: true,
    definition: {
      type: "function",
      name: "open_meteo_forecast",
      description: "Get a short weather forecast via Open-Meteo (1-7 days).",
      parameters: {
        type: "object",
        properties: {
          city: {
            type: "string",
            description: "City name, e.g. Detroit",
          },
          days: {
            type: "integer",
            description: "Number of days of forecast to get",
          },
        },
        required: ["city", "days"],
        additionalProperties: false,
      },
      strict: true,
    },
  },
  {
    key: "builtin:web_search",
    type: "builtin",
    displayName: "Web Search",
    description: "Allow the assistant to use provider-managed web searches for fresh information on OpenAI or xAI.",
    defaultEnabled: true,
    onlyServices: ["openai", "xai"],
    definition: {
      type: "web_search",
    },
  },
  {
    key: "builtin:code_interpreter",
    type: "builtin",
    displayName: "Code Interpreter",
    description: "Allow the assistant to run Python code and work with files in the provider sandbox.",
    defaultEnabled: false,
    onlyServices: ["openai", "xai"],
    definition: {
      type: "code_interpreter",
      container: {
        type: "auto",
        file_ids: [],
      },
    },
  },
  {
    key: "builtin:image_generation",
    type: "builtin",
    displayName: "OpenAI Images",
    description: "Generate or edit images with OpenAI. Uses the built-in image tool on OpenAI and the gpt-image-2 API (OpenAI API key required) on other services.",
    defaultEnabled: true,
    definition: {
      type: "image_generation",
    },
  },
  {
    key: "builtin:shell",
    type: "builtin",
    displayName: "Shell",
    description: "Allow the assistant to run shell commands in a sandboxed container environment.",
    defaultEnabled: false,
    onlyServices: ["openai"],
    definition: {
      type: "shell",
      environment: {
        type: "container_auto",
      },
    },
  },
  {
    key: "builtin:file_search",
    type: "builtin",
    displayName: "File Search",
    description: "Search through uploaded documents using vector stores.",
    defaultEnabled: false,
    onlyServices: ["openai"],
    definition: {
      type: "file_search",
      vector_store_ids: [],
    },
  },
  {
    key: "function:grok_generate_image",
    type: "function",
    displayName: "Grok Imagine Image",
    description: "Generate an image with xAI Grok Imagine. Requires an xAI API key.",
    defaultEnabled: true,
    definition: {
      type: "function",
      name: "grok_generate_image",
      description: "Generate an image with xAI Grok Imagine.",
      parameters: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description: "A detailed description of the image to generate.",
          },
          aspect_ratio: {
            type: "string",
            description: "Requested image aspect ratio.",
            enum: [
              "1:1", "16:9", "9:16", "4:3", "3:4",
              "3:2", "2:3", "2:1", "1:2",
              "19.5:9", "9:19.5", "20:9", "9:20", "auto",
            ],
          },
          resolution: {
            type: "string",
            description: "Output resolution.",
            enum: ["1k", "2k"],
          },
          n: {
            type: "integer",
            description: "Number of images to generate.",
            minimum: 1,
            maximum: 10,
          },
        },
        required: ["prompt"],
        additionalProperties: false,
      },
    },
    requiresApiKeyService: "xai",
  },
  {
    key: "function:grok_edit_image",
    type: "function",
    displayName: "Grok Imagine Edit",
    description: "Edit one or more images with xAI Grok Imagine. If no image URL is provided, the most recent uploaded or generated image is used.",
    defaultEnabled: true,
    definition: {
      type: "function",
      name: "grok_edit_image",
      description: "Edit one or more images with xAI Grok Imagine.",
      parameters: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description: "A detailed description of the requested image edit.",
          },
          image_url: {
            type: "string",
            description: "Optional data URI or public URL for a single source image.",
          },
          image_urls: {
            type: "array",
            description: "Optional list of source image URLs or data URIs.",
            items: {
              type: "string",
            },
            minItems: 1,
            maxItems: 3,
          },
          aspect_ratio: {
            type: "string",
            description: "Requested image aspect ratio.",
            enum: [
              "1:1", "16:9", "9:16", "4:3", "3:4",
              "3:2", "2:3", "2:1", "1:2",
              "19.5:9", "9:19.5", "20:9", "9:20", "auto",
            ],
          },
          resolution: {
            type: "string",
            description: "Output resolution.",
            enum: ["1k", "2k"],
          },
          n: {
            type: "integer",
            description: "Number of edited images to return.",
            minimum: 1,
            maximum: 10,
          },
        },
        required: ["prompt"],
        additionalProperties: false,
      },
    },
    requiresApiKeyService: "xai",
  },
];

/**
 * Client-side function definitions emitted for `builtin:image_generation` when
 * a non-OpenAI service is active. On OpenAI itself the provider-managed
 * `image_generation` tool is sent instead, so these never appear there. The
 * handlers live in `../openaiImageTool.ts`.
 */
export const OPENAI_IMAGE_FUNCTION_TOOLS: ToolDefinition[] = [
  {
    type: "function",
    name: "openai_generate_image",
    description: "Generate an image with OpenAI gpt-image-2.",
    parameters: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "A detailed description of the image to generate.",
        },
        size: {
          type: "string",
          description: "Requested image size.",
          enum: ["1024x1024", "1536x1024", "1024x1536", "auto"],
        },
        quality: {
          type: "string",
          description: "Output quality.",
          enum: ["low", "medium", "high", "auto"],
        },
        n: {
          type: "integer",
          description: "Number of images to generate.",
          minimum: 1,
          maximum: 10,
        },
      },
      required: ["prompt"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "openai_edit_image",
    description: "Edit one or more images with OpenAI gpt-image-2. If no image URL is provided, the most recent uploaded or generated image is used.",
    parameters: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "A detailed description of the requested image edit.",
        },
        image_url: {
          type: "string",
          description: "Optional data URI or public URL for a single source image.",
        },
        image_urls: {
          type: "array",
          description: "Optional list of source image URLs or data URIs.",
          items: {
            type: "string",
          },
          minItems: 1,
          maxItems: 10,
        },
        size: {
          type: "string",
          description: "Requested image size.",
          enum: ["1024x1024", "1536x1024", "1024x1536", "auto"],
        },
        quality: {
          type: "string",
          description: "Output quality.",
          enum: ["low", "medium", "high", "auto"],
        },
        n: {
          type: "integer",
          description: "Number of edited images to return.",
          minimum: 1,
          maximum: 10,
        },
      },
      required: ["prompt"],
      additionalProperties: false,
    },
  },
];

/**
 * Whether a function-call name is one of the client-side image
 * generation/edit tools, whose execution leaves the user waiting on an image.
 */
export function isImageGenerationToolName(name: string): boolean {
  return name === "openai_generate_image"
    || name === "openai_edit_image"
    || name === "grok_generate_image"
    || name === "grok_edit_image";
}
