import z from "zod";
import { PAGINATION } from "@/config/constants";
import {
  autoFixWorkflowExecution,
  type GenerateWorkflowModelId,
} from "@/features/ai-workflow/server/workflow-assistant";
import prisma from "@/lib/db";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";

const aiModelIdSchema = z.enum(["gpt-4o", "gpt-4o-mini"]);

export const executionsRouter = createTRPCRouter({
  getOne: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) => {
      return prisma.execution.findUniqueOrThrow({
        where: {
          id: input.id,
          workflow: {
            userId: ctx.auth.user.id,
          },
        },
        include: {
          workflow: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });
    }),
  autoFix: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        credentialId: z.string(),
        modelId: aiModelIdSchema.default("gpt-4o"),
      }),
    )
    .mutation(({ ctx, input }) => {
      return autoFixWorkflowExecution({
        userId: ctx.auth.user.id,
        executionId: input.id,
        credentialId: input.credentialId,
        modelId: input.modelId as GenerateWorkflowModelId,
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
      }),
    )
    .query(async ({ ctx, input }) => {
      const { page, pageSize } = input;

      const [items, totalCount] = await Promise.all([
        prisma.execution.findMany({
          skip: (page - 1) * pageSize,
          take: pageSize,
          where: {
            workflow: {
              userId: ctx.auth.user.id,
            },
          },
          orderBy: {
            startedAt: "desc",
          },
          include: {
            workflow: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        }),
        prisma.execution.count({
          where: {
            workflow: {
              userId: ctx.auth.user.id,
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
