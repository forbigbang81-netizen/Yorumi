import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/app-error';
import { logger } from '../logger';
import { sendError } from '../http/api-response';

export const errorHandler = (error: unknown, req: Request, res: Response, _next: NextFunction) => {
    const appError = error instanceof AppError
        ? error
        : new AppError('Internal server error', 500, { expose: false });

    logger.error(`Unhandled request failure: ${req.method} ${req.originalUrl}`, error);

    return sendError(
        res,
        appError.expose ? appError.message : 'Internal server error',
        appError.statusCode
    );
};
