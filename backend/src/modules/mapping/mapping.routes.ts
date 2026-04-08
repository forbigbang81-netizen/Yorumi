import { Router } from 'express';
import { asyncHandler } from '../../core/http/async-handler';
import { mappingController } from './mapping.controller';

const router = Router();

router.get('/:id', asyncHandler(mappingController.getMapping));
router.post('/', asyncHandler(mappingController.saveMapping));
router.delete('/:id', asyncHandler(mappingController.deleteMapping));
router.post('/identify', asyncHandler(mappingController.identify));

export default router;
