import { type NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { sendWorkflowExecution } from "@/inngest/utils";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ secret: string }> },
) {
  try {
    const { secret } = await params;

    const workflow = await prisma.workflow.findUnique({
      where: { webhookSecret: secret },
    });

    if (!workflow) {
      return NextResponse.json(
        { success: false, error: "Invalid webhook URL" },
        { status: 404 },
      );
    }

    if (!workflow.isActive) {
      return NextResponse.json(
        { success: false, error: "Workflow is inactive" },
        { status: 400 },
      );
    }

    let body: Record<string, unknown> = {};
    try {
      body = await request.json();
    } catch {
      // No body is fine for simple triggers
    }

    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      if (!key.startsWith("x-") && key !== "authorization") return;
      headers[key] = value;
    });

    await sendWorkflowExecution({
      workflowId: workflow.id,
      initialData: {
        webhook: {
          body,
          headers,
          method: request.method,
          url: request.url,
          timestamp: new Date().toISOString(),
        },
      },
    });

    return NextResponse.json({ success: true, message: "Workflow triggered" });
  } catch (error) {
    console.error("Webhook trigger error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}

// Also support GET for simple webhook triggers
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ secret: string }> },
) {
  return POST(request, context);
}
