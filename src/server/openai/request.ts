import { OpenAI } from "openai";
import { encodingForModel } from "tiktoken-node";
import {
  SafeParseError,
  SafeParseReturnType,
  SafeParseSuccess,
  ZodSchema,
} from "zod";
import { parse } from "jsonc-parser";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const CONTEXT_WINDOW = {
  "gpt-4-0613": 8192,
  "gpt-4-vision-preview": 128000,
  "gpt-4-1106-preview": 128000,
};

// Note that gpt-4-1106-preview has a max_tokens limit of 4K, despite having a context window of 128K
const MAX_OUTPUT = {
  "gpt-4-0613": 8192,
  "gpt-4-vision-preview": 4096,
  "gpt-4-1106-preview": 4096,
};

type Model = keyof typeof CONTEXT_WINDOW;

export const getMaxTokensForResponse = async (
  inputText: string,
  model: Model
): Promise<number> => {
  try {
    const enc = encodingForModel(model);
    const tokens = enc.encode(inputText);
    const numberOfInputTokens = tokens.length;

    const maxContextTokens = CONTEXT_WINDOW[model];
    const padding = Math.ceil(maxContextTokens * 0.01);

    const maxTokensForResponse =
      maxContextTokens - numberOfInputTokens - padding;

    if (maxTokensForResponse <= 0) {
      throw new Error(
        "Input text is too large to fit within the context window."
      );
    }

    return Math.min(maxTokensForResponse, MAX_OUTPUT[model]);
  } catch (error) {
    console.log("Error in getMaxTokensForResponse: ", error);
    return Math.round(CONTEXT_WINDOW[model] / 2);
  }
};

export const sendGptRequest = async (
  userPrompt: string,
  systemPrompt = "You are a helpful assistant.",
  temperature = 0.2,
  retries = 10,
  delay = 60000 // rate limit is 40K tokens per minute, so by default start with 60 seconds
) => {
  console.log("\n\n --- User Prompt --- \n\n", userPrompt);
  console.log("\n\n --- System Prompt --- \n\n", systemPrompt);

  const model = "gpt-4-vision-preview";

  try {
    const max_tokens = await getMaxTokensForResponse(
      userPrompt + systemPrompt,
      model
    );

    console.log(`\n +++ Calling ${model} with max_tokens: ${max_tokens} `);
    const startTime = Date.now();
    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: "https://jacob-images-staging.s3.us-west-2.amazonaws.com/Product+Detail.png",
                detail: "high",
              },
            },
            {
              type: "text",
              text: `Act as an expert-level front-end software engineer and designer. The IMAGE above is EXACTLY the design that you MUST implement with code.
            A low-level developer has provided some basic code to get you started. This code WILL have errors and you MUST use this design to correct for those errors. 
            If you can not correct for the errors, you MUST use the design to write your own code. Your code MUST be pixel-perfect! If you can achieve this on the first try, you will get a $100,000 bonus.
            You MUST use this code ONLY as a starting point, but you MUST follow all the instructions below.`,
            },
          ],
        },
        { role: "user", content: userPrompt },
      ],
      max_tokens,
      temperature,
    });
    const endTime = Date.now();
    console.log(`\n +++ ${model} Response time ${endTime - startTime} ms`);

    const gptResponse = response.choices[0].message;
    return gptResponse.content;
  } catch (error) {
    if (
      retries === 0 ||
      (error as { response?: Response })?.response?.status !== 429
    ) {
      console.error(`Error in GPT request: ${error}`);
      throw error;
    } else {
      console.log(
        `Received 429, retries remaining: ${retries}. Retrying in ${delay} ms...`
      );
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          sendGptRequest(
            userPrompt,
            systemPrompt,
            temperature,
            retries - 1,
            delay * 2
          )
            .then(resolve)
            .catch(reject);
        }, delay);
      });
    }
  }
};

// Return type should be a ZodSchema or an array of ZodSchema objects
export const sendGptRequestWithSchema = async (
  userPrompt: string,
  systemPrompt: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  zodSchema: ZodSchema<any>,
  maxRetries: number = 3,
  temperature: number = 0.2
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> => {
  let extractedInfo;
  let retries = 0; // Initialize a retries counter

  // Loop until a valid response is received or the maxRetries limit is reached
  while (retries < maxRetries) {
    let gptResponse;

    try {
      gptResponse = (await sendGptRequest(
        userPrompt,
        systemPrompt +
          "IMPORTANT! YOU MUST enclose ALL code in ``` TypeScript code blocks ```",
        temperature // Use a lower temperature for retries
      )) as string;

      if (!gptResponse) {
        throw new Error("/n/n/n/n **** Empty response from GPT **** /n/n/n/n");
      }

      // Remove lines that start with ```
      gptResponse = gptResponse.replace(/^```.*$/gm, "");

      extractedInfo = parse(gptResponse);

      // if the response is an array of objects, validate each object individually and return the full array if successful
      if (Array.isArray(extractedInfo)) {
        const validatedInfo = extractedInfo.map(
          (info) => zodSchema.safeParse(info) // as SafeParseReturnType<any, any>,
        );

        const failedValidations = validatedInfo.filter(
          (result) => result.success === false
        );

        if (failedValidations.length > 0) {
          throw new Error(
            `Invalid response from GPT - object is not able to be parsed using the provided schema: ${JSON.stringify(
              failedValidations
            )}`
          );
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (validatedInfo as SafeParseSuccess<any>[]).map(
          (result) => result.data
        );
      }

      // if the response is a single object, validate it and return it if successful
      const validationResult = zodSchema.safeParse(
        extractedInfo
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ) as SafeParseReturnType<any, any>;

      if (validationResult.success) {
        return validationResult.data;
      }

      throw new Error(
        `Invalid response from GPT - object is not able to be parsed using the provided schema: ${JSON.stringify(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (validationResult as SafeParseError<any>).error
        )}`
      );
    } catch (error) {
      console.log(
        `Error occurred during GPT request: ${(error as { message?: string })
          ?.message}`
      );
      retries++;
    }
  }

  throw new Error(`Max retries exceeded for GPT request: ${userPrompt}`);
};
