import { type Issue, type Repository } from "@octokit/webhooks-types";
import { dedent } from "ts-dedent";
import fs from "fs";
import path from "path";

import { emitCodeEvent } from "~/server/utils/events";
import { getTypes, getImages } from "../analyze/sourceMap";
import {
  parseTemplate,
  constructNewOrEditSystemPrompt,
  generateJacobBranchName,
  type RepoSettings,
  getStyles,
  type BaseEventData,
} from "../utils";
import { sendGptVisionRequest } from "../openai/request";
import { setNewBranch } from "../git/branch";
import { checkAndCommit } from "./checkAndCommit";
import { saveNewFile } from "../utils/files";
import { saveImages } from "../utils/images";
import { getSnapshotUrl } from "~/app/utils";

export interface CreateNewFileParams extends BaseEventData {
  newFileName: string;
  repository: Repository;
  token: string;
  issue: Issue;
  rootPath: string;
  sourceMap: string;
  baseBranch?: string;
  repoSettings?: RepoSettings;
}

export async function createNewFile(params: CreateNewFileParams) {
  const {
    newFileName,
    repository,
    token,
    issue,
    rootPath,
    sourceMap,
    baseBranch,
    repoSettings,
    ...baseEventData
  } = params;
  if (fs.existsSync(path.join(rootPath, newFileName))) {
    throw new Error(dedent`
      The issue requested that I create a new file named ${newFileName}, but a file with that name already exists.
      I'm going to stop working on this issue to avoid overwriting important code in that file.

      Please consider creating a new issue to make it clear if you would like me to edit this file or to create a new file with a different name.
    `);
  }

  const snapshotUrl = getSnapshotUrl(issue.body);
  const planTemplateParams = {
    newFileName,
    issueBody: issue.body ?? "",
  };

  const planSystemPrompt = parseTemplate(
    "dev",
    "plan_new_file",
    "system",
    planTemplateParams,
  );
  const planUserPrompt = parseTemplate(
    "dev",
    "plan_new_file",
    "user",
    planTemplateParams,
  );
  const plan =
    (await sendGptVisionRequest(
      planUserPrompt,
      planSystemPrompt,
      snapshotUrl,
      0.2,
    )) ?? "";

  const types = getTypes(rootPath, repoSettings);
  const packages = Object.keys(repoSettings?.packageDependencies ?? {}).join(
    "\n",
  );
  const styles = await getStyles(rootPath, repoSettings);
  let images = await getImages(rootPath, repoSettings);
  images = await saveImages(images, issue.body, rootPath, repoSettings);

  const codeTemplateParams = {
    ...planTemplateParams,
    plan,
    sourceMap,
    types,
    packages,
    images,
    styles,
    snapshotUrl: snapshotUrl ?? "",
  };

  const codeSystemPrompt = constructNewOrEditSystemPrompt(
    "code_new_file",
    codeTemplateParams,
    repoSettings,
  );
  const codeUserPrompt = parseTemplate(
    "dev",
    "code_new_file",
    "user",
    codeTemplateParams,
  );
  const code = (await sendGptVisionRequest(
    codeUserPrompt,
    codeSystemPrompt,
    snapshotUrl,
    0.2,
    baseEventData,
  ))!;

  if (code.length < 10) {
    console.log(`[${repository.full_name}] code`, code);
    console.log(`[${repository.full_name}] No code generated. Exiting...`);
    throw new Error("No code generated");
  }

  const newBranch = await generateJacobBranchName(
    issue.number,
    issue.title,
    issue.body ?? "",
  );

  await setNewBranch({
    ...baseEventData,
    rootPath,
    branchName: newBranch,
  });

  saveNewFile(rootPath, newFileName, code);

  await emitCodeEvent({
    ...baseEventData,
    fileName: newFileName,
    filePath: rootPath,
    codeBlock: code,
  });

  await checkAndCommit({
    ...baseEventData,
    repository,
    token,
    rootPath,
    baseBranch,
    branch: newBranch,
    repoSettings,
    commitMessage: `JACoB commit for Issue ${issue.number}`,
    issue,
    newPrTitle: `Create ${newFileName}`,
    newPrBody: `## Summary:\n\n${issue.body}\n\n## Plan:\n\n${plan}`,
    newPrReviewers: issue.assignees.map((assignee) => assignee.login),
  });
}
