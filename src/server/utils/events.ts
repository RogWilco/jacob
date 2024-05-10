import { db } from "~/server/db/db";
import { TaskType } from "~/server/db/enums";
import { type BaseEventData, getLanguageFromFileName } from "~/server/utils";
import type { PullRequest } from "~/server/code/checkAndCommit";

interface EmitCodeEventParams extends BaseEventData {
  fileName: string;
  filePath: string;
  codeBlock: string;
}

export async function emitCodeEvent(params: EmitCodeEventParams) {
  const { fileName, filePath, codeBlock, ...baseEventData } = params;
  await db.events.insert({
    ...baseEventData,
    type: TaskType.code,
    payload: {
      type: TaskType.code,
      fileName,
      filePath,
      codeBlock,
      language: getLanguageFromFileName(fileName),
    },
  });
}

interface EmitPREventParams extends BaseEventData {
  pullRequest: PullRequest;
}

export async function emitPREvent(params: EmitPREventParams) {
  const { pullRequest, ...baseEventData } = params;
  await db.events.insert({
    ...baseEventData,
    type: TaskType.pull_request,
    payload: {
      type: TaskType.pull_request,
      pullRequestId: pullRequest.number,
      title: pullRequest.title,
      description: pullRequest.body,
      link: pullRequest.html_url,
      status: pullRequest.state,
      createdAt: pullRequest.created_at,
      author: pullRequest.user.login,
    },
  });
}

interface EmitCommandEventParams extends BaseEventData {
  command: string;
  directory: string;
  response: string;
  exitCode: number | null;
}

export async function emitCommandEvent(params: EmitCommandEventParams) {
  const { command, directory, response, exitCode, ...baseEventData } = params;
  await db.events.insert({
    ...baseEventData,
    type: TaskType.command,
    payload: {
      type: TaskType.command,
      directory,
      command,
      response,
      exitCode,
    },
  });
}