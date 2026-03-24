import { createId } from "@paralleldrive/cuid2";
import { TRPCError } from "@trpc/server";
import type { Edge, Node } from "@xyflow/react";
import { generateSlug } from "random-word-slugs";
import z from "zod";
import { PAGINATION } from "@/config/constants";
import { generateApiKey } from "@/features/workflows/lib/api-key";
import {
  exportWorkflow,
  validateImport,
} from "@/features/workflows/lib/export-import";
import {
  generateWebhookSecret,
  getWebhookUrl,
} from "@/features/workflows/lib/webhook-url";
import { NodeType } from "@/generated/prisma";
import { sendWorkflowExecution } from "@/inngest/utils";
import prisma from "@/lib/db";
import {
  createTRPCRouter,
  premiumProcedure,
  protectedProcedure,
} from "@/trpc/init";

const workflowNodeSchema = z.object({
  id: z.string(),
  type: z.string().nullish(),
  position: z.object({ x: z.number(), y: z.number() }),
  data: z.record(z.string(), z.any()).optional(),
});

const workflowEdgeSchema = z.object({
  source: z.string(),
  target: z.string(),
  sourceHandle: z.string().nullish(),
  targetHandle: z.string().nullish(),
});

const workflowSnapshotSchema = z
  .object({
    nodes: z.array(workflowNodeSchema).optional(),
    edges: z.array(workflowEdgeSchema).optional(),
  })
  .refine(
    (value) =>
      (value.nodes === undefined && value.edges === undefined) ||
      (value.nodes !== undefined && value.edges !== undefined),
    {
      message: "nodes and edges must be provided together",
      path: ["nodes"],
    },
  );

export const workflowsRouter = createTRPCRouter({
  execute: protectedProcedure
    .input(
      workflowSnapshotSchema.extend({
        id: z.string(),
        debugStartNodeId: z.string().nullish(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const workflow = await prisma.workflow.findUniqueOrThrow({
        where: {
          id: input.id,
          userId: ctx.auth.user.id,
        },
      });

      const nodes = input.nodes;
      const edges = input.edges;

      if (nodes && edges) {
        await prisma.$transaction(async (tx) => {
          await tx.node.deleteMany({
            where: { workflowId: input.id },
          });

          await tx.node.createMany({
            data: nodes.map((node) => ({
              id: node.id,
              workflowId: input.id,
              name: node.type || "unknown",
              type: node.type as NodeType,
              position: node.position,
              data: node.data || {},
            })),
          });

          await tx.connection.createMany({
            data: edges.map((edge) => ({
              workflowId: input.id,
              fromNodeId: edge.source,
              toNodeId: edge.target,
              fromOutput: edge.sourceHandle || "main",
              toInput: edge.targetHandle || "main",
            })),
          });

          await tx.workflow.update({
            where: { id: input.id },
            data: { updatedAt: new Date() },
          });
        });
      }

      await sendWorkflowExecution({
        workflowId: input.id,
        debugStartNodeId: input.debugStartNodeId ?? undefined,
      });

      return workflow;
    }),
  create: premiumProcedure.mutation(({ ctx }) => {
    return prisma.workflow.create({
      data: {
        name: generateSlug(3),
        userId: ctx.auth.user.id,
        nodes: {
          create: {
            type: NodeType.INITIAL,
            position: { x: 0, y: 0 },
            name: NodeType.INITIAL,
          },
        },
      },
    });
  }),
  remove: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => {
      return prisma.workflow.delete({
        where: {
          id: input.id,
          userId: ctx.auth.user.id,
        },
      });
    }),
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        nodes: z.array(workflowNodeSchema),
        edges: z.array(workflowEdgeSchema),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, nodes, edges } = input;

      const workflow = await prisma.workflow.findUniqueOrThrow({
        where: { id, userId: ctx.auth.user.id },
      });

      // Transaction to ensure consistency
      return await prisma.$transaction(async (tx) => {
        // Delete existing nodes and connections (cascade deletes connections)
        await tx.node.deleteMany({
          where: { workflowId: id },
        });

        // Create nodes
        await tx.node.createMany({
          data: nodes.map((node) => ({
            id: node.id,
            workflowId: id,
            name: node.type || "unknown",
            type: node.type as NodeType,
            position: node.position,
            data: node.data || {},
          })),
        });

        // Create connections
        await tx.connection.createMany({
          data: edges.map((edge) => ({
            workflowId: id,
            fromNodeId: edge.source,
            toNodeId: edge.target,
            fromOutput: edge.sourceHandle || "main",
            toInput: edge.targetHandle || "main",
          })),
        });

        // Update workflow's updateAt timestamp
        await tx.workflow.update({
          where: { id },
          data: { updatedAt: new Date() },
        });

        return workflow;
      });
    }),
  updateName: protectedProcedure
    .input(z.object({ id: z.string(), name: z.string().min(1) }))
    .mutation(({ ctx, input }) => {
      return prisma.workflow.update({
        where: { id: input.id, userId: ctx.auth.user.id },
        data: { name: input.name },
      });
    }),
  getOne: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const workflow = await prisma.workflow.findUniqueOrThrow({
        where: { id: input.id, userId: ctx.auth.user.id },
        include: { nodes: true, connections: true },
      });

      // Transform server nodes to react-flow compatible nodes
      const nodes: Node[] = workflow.nodes.map((node) => ({
        id: node.id,
        type: node.type,
        position: node.position as { x: number; y: number },
        data: (node.data as Record<string, unknown>) || {},
      }));

      // Transform server connections to react-flow compatible edges
      const edges: Edge[] = workflow.connections.map((connection) => ({
        id: connection.id,
        source: connection.fromNodeId,
        target: connection.toNodeId,
        sourceHandle: connection.fromOutput,
        targetHandle: connection.toInput,
      }));

      return {
        id: workflow.id,
        name: workflow.name,
        nodes,
        edges,
      };
    }),
  updateSettings: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        tags: z.array(z.string()).optional(),
        isActive: z.boolean().optional(),
      }),
    )
    .mutation(({ ctx, input }) => {
      const { id, ...data } = input;
      return prisma.workflow.update({
        where: { id, userId: ctx.auth.user.id },
        data,
      });
    }),
  generateWebhookUrl: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const secret = generateWebhookSecret();
      await prisma.workflow.update({
        where: { id: input.id, userId: ctx.auth.user.id },
        data: { webhookSecret: secret },
      });
      return {
        secret,
        url: getWebhookUrl(secret),
      };
    }),
  exportWorkflow: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const workflow = await prisma.workflow.findUniqueOrThrow({
        where: { id: input.id, userId: ctx.auth.user.id },
        include: { nodes: true, connections: true },
      });
      return exportWorkflow(
        {
          name: workflow.name,
          description: workflow.description,
          tags: workflow.tags,
        },
        workflow.nodes.map((n) => ({
          id: n.id,
          type: n.type,
          name: n.name,
          position: n.position,
          data: n.data,
        })),
        workflow.connections.map((c) => ({
          fromNodeId: c.fromNodeId,
          toNodeId: c.toNodeId,
          fromOutput: c.fromOutput,
          toInput: c.toInput,
        })),
      );
    }),
  // API Key management
  createApiKey: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        workflowId: z.string().optional(),
        expiresAt: z.string().datetime().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const key = generateApiKey();
      const apiKey = await prisma.apiKey.create({
        data: {
          name: input.name,
          key,
          userId: ctx.auth.user.id,
          workflowId: input.workflowId,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        },
      });
      // Return the raw key only once (on creation)
      return {
        id: apiKey.id,
        name: apiKey.name,
        key,
        createdAt: apiKey.createdAt,
      };
    }),
  listApiKeys: protectedProcedure.query(async ({ ctx }) => {
    const keys = await prisma.apiKey.findMany({
      where: { userId: ctx.auth.user.id },
      select: {
        id: true,
        name: true,
        key: true,
        workflowId: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
    return keys.map((k) => ({
      ...k,
      key: `${k.key.slice(0, 7)}...${k.key.slice(-4)}`,
    }));
  }),
  deleteApiKey: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => {
      return prisma.apiKey.delete({
        where: { id: input.id, userId: ctx.auth.user.id },
      });
    }),
  duplicate: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const source = await prisma.workflow.findUniqueOrThrow({
        where: { id: input.id, userId: ctx.auth.user.id },
        include: { nodes: true, connections: true },
      });

      const idMap = new Map<string, string>();

      return prisma.$transaction(async (tx) => {
        const newWorkflow = await tx.workflow.create({
          data: {
            name: `${source.name} (copy)`,
            description: source.description,
            tags: source.tags,
            userId: ctx.auth.user.id,
          },
        });

        // Create nodes with new IDs
        for (const node of source.nodes) {
          const newId = createId();
          idMap.set(node.id, newId);
          await tx.node.create({
            data: {
              id: newId,
              workflowId: newWorkflow.id,
              name: node.name,
              type: node.type,
              position: node.position as object,
              data: node.data as object,
              credentialId: node.credentialId,
            },
          });
        }

        // Create connections with remapped IDs
        for (const conn of source.connections) {
          await tx.connection.create({
            data: {
              workflowId: newWorkflow.id,
              fromNodeId: idMap.get(conn.fromNodeId) || conn.fromNodeId,
              toNodeId: idMap.get(conn.toNodeId) || conn.toNodeId,
              fromOutput: conn.fromOutput,
              toInput: conn.toInput,
            },
          });
        }

        return newWorkflow;
      });
    }),
  importWorkflow: protectedProcedure
    .input(z.object({ data: z.unknown() }))
    .mutation(async ({ ctx, input }) => {
      const validation = validateImport(input.data);
      if (!validation.valid || !validation.workflow) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Invalid workflow data: ${validation.errors.join(", ")}`,
        });
      }

      const wf = validation.workflow;
      const idMap = new Map<string, string>();

      return prisma.$transaction(async (tx) => {
        const newWorkflow = await tx.workflow.create({
          data: {
            name: wf.workflow.name,
            description: wf.workflow.description,
            tags: wf.workflow.tags,
            userId: ctx.auth.user.id,
          },
        });

        for (const node of wf.nodes) {
          const newId = createId();
          idMap.set(node.id, newId);
          await tx.node.create({
            data: {
              id: newId,
              workflowId: newWorkflow.id,
              name: node.name || node.type,
              type: node.type as NodeType,
              position: node.position as object,
              data: (node.data || {}) as object,
            },
          });
        }

        for (const conn of wf.connections) {
          await tx.connection.create({
            data: {
              workflowId: newWorkflow.id,
              fromNodeId: idMap.get(conn.fromNodeId) || conn.fromNodeId,
              toNodeId: idMap.get(conn.toNodeId) || conn.toNodeId,
              fromOutput: conn.fromOutput,
              toInput: conn.toInput,
            },
          });
        }

        return newWorkflow;
      });
    }),
  getMany: protectedProcedure
    .input(
      z.object({
        page: z.number().default(PAGINATION.DEFAULT_PAGE),
        pageSize: z
          .number()
          .min(PAGINATION.MIN_PAGE_SIZE)
          .max(PAGINATION.MAX_PAGE_SIZE)
          .default(PAGINATION.DEFAULT_PAGE_SIZE),
        search: z.string().default(""),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { page, pageSize, search } = input;

      const [items, totalCount] = await Promise.all([
        prisma.workflow.findMany({
          skip: (page - 1) * pageSize,
          take: pageSize,
          where: {
            userId: ctx.auth.user.id,
            name: {
              contains: search,
              mode: "insensitive",
            },
          },
          orderBy: {
            updatedAt: "desc",
          },
        }),
        prisma.workflow.count({
          where: {
            userId: ctx.auth.user.id,
            name: {
              contains: search,
              mode: "insensitive",
            },
          },
        }),
      ]);

      const totalPages = Math.ceil(totalCount / pageSize);
      const hasNextPage = page < totalPages;
      const hasPreviousPage = page > 1;

      return {
        items,
        page,
        pageSize,
        totalCount,
        totalPages,
        hasNextPage,
        hasPreviousPage,
      };
    }),
});
