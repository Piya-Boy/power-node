import Handlebars from "handlebars";
import { NonRetriableError } from "inngest";
import ky from "ky";
import type { NodeExecutor } from "@/features/executions/types";
import { googleServicesChannel } from "@/inngest/channels/google-services";
import prisma from "@/lib/db";
import { decrypt } from "@/lib/encryption";

type GoogleDriveData = {
  variableName?: string;
  credentialId?: string;
  operation?: "list_files" | "get_file" | "create_folder" | "delete_file";
  fileId?: string;
  folderName?: string;
  parentId?: string;
  query?: string;
};

const DRIVE_API = "https://www.googleapis.com/drive/v3";

export const googleDriveExecutor: NodeExecutor<GoogleDriveData> = async ({
  data,
  nodeId,
  userId,
  context,
  step,
  publish,
}) => {
  await publish(googleServicesChannel().status({ nodeId, status: "loading" }));

  if (!data.variableName) {
    await publish(googleServicesChannel().status({ nodeId, status: "error" }));
    throw new NonRetriableError("Google Drive node: Variable name is missing");
  }
  if (!data.credentialId) {
    await publish(googleServicesChannel().status({ nodeId, status: "error" }));
    throw new NonRetriableError("Google Drive node: Credential is required");
  }
  if (!data.operation) {
    await publish(googleServicesChannel().status({ nodeId, status: "error" }));
    throw new NonRetriableError("Google Drive node: Operation is required");
  }

  try {
    const result = await step.run("google-drive-op", async () => {
      const credential = await prisma.credential.findUnique({
        where: { id: data.credentialId, userId },
      });
      if (!credential) throw new NonRetriableError("Google Drive node: Credential not found");

      const token = decrypt(credential.value);
      const headers = { Authorization: `Bearer ${token}` };
      let responseData: unknown;

      switch (data.operation) {
        case "list_files": {
          const searchParams: Record<string, string> = {
            pageSize: "100",
            fields: "files(id,name,mimeType,size,createdTime,modifiedTime,webViewLink)",
          };
          if (data.query) searchParams.q = Handlebars.compile(data.query)(context);

          responseData = await ky.get(`${DRIVE_API}/files`, { headers, searchParams }).json();
          break;
        }

        case "get_file": {
          if (!data.fileId) throw new NonRetriableError("Google Drive node: File ID is required");
          const fileId = Handlebars.compile(data.fileId)(context);
          responseData = await ky
            .get(`${DRIVE_API}/files/${fileId}`, {
              headers,
              searchParams: { fields: "id,name,mimeType,size,createdTime,modifiedTime,webViewLink" },
            })
            .json();
          break;
        }

        case "create_folder": {
          if (!data.folderName) throw new NonRetriableError("Google Drive node: Folder name is required");
          const folderName = Handlebars.compile(data.folderName)(context);
          const body: Record<string, unknown> = {
            name: folderName,
            mimeType: "application/vnd.google-apps.folder",
          };
          if (data.parentId) {
            body.parents = [Handlebars.compile(data.parentId)(context)];
          }
          responseData = await ky
            .post(`${DRIVE_API}/files`, {
              headers: { ...headers, "Content-Type": "application/json" },
              json: body,
            })
            .json();
          break;
        }

        case "delete_file": {
          if (!data.fileId) throw new NonRetriableError("Google Drive node: File ID is required");
          const fileId = Handlebars.compile(data.fileId)(context);
          await ky.delete(`${DRIVE_API}/files/${fileId}`, { headers });
          responseData = { deleted: true, fileId };
          break;
        }

        default:
          throw new NonRetriableError(`Google Drive node: Unknown operation "${data.operation}"`);
      }

      return { ...context, [data.variableName!]: responseData };
    });

    await publish(googleServicesChannel().status({ nodeId, status: "success" }));
    return result;
  } catch (error) {
    await publish(googleServicesChannel().status({ nodeId, status: "error" }));
    throw error;
  }
};
