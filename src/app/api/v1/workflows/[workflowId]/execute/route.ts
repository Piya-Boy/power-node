import { type NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { sendWorkflowExecution } from "@/inngest/utils";

async function authenticateApiKey(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const key = authHeader.slice(7);

  const apiKey = await prisma.apiKey.findUnique({
    where: { key },
    include: { user: true },
  });

  if (!apiKey) return null;

  // Check expiration
  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
    return null;
  }

  // Update last used
  await prisma.apiKey.update({
    where: { id: apiKey.id },
    data: { lastUsedAt: new Date() },
  });

  return apiKey;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workflowId: string }> },
) {
  try {
    const { workflowId } = await params;

    const apiKey = await authenticateApiKey(request);
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: "Invalid or expired API key" },
        { status: 401 },
      );
    }

    // Check workflow belongs to user and optionally to the API key
    const workflow = await prisma.workflow.findFirst({
      where: {
        id: workflowId,
        userId: apiKey.userId,
        ...(apiKey.workflowId ? { id: apiKey.workflowId } : {}),
      },
    });

    if (!workflow) {
      return NextResponse.json(
        { success: false, error: "Workflow not found or access denied" },
        { status: 404 },
      );
    }

    if (!workflow.isActive) {
      return NextResponse.json(
        { success: false, error: "Workflow is inactive" },
        { status: 400 },
      );
    }

    // Parse optional input data
    let initialData: Record<string, unknown> = {};
    try {
      const body = await request.json();
      initialData = body.data || body;
    } catch {
      // No body is fine
    }

    await sendWorkflowExecution({
      workflowId,
      initialData,
    });

    return NextResponse.json({
      success: true,
      message: "Workflow execution started",
      workflowId,
    });
  } catch (error) {
    console.error("API execution error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
