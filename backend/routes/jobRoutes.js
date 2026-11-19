import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { getBackgroundJob } from '../services/jobService.js';

const router = express.Router();

router.get('/jobs/:id', authenticate, async (req, res, next) => {
  try {
    const job = await getBackgroundJob(req.params.id);
    if (!job) {
      return res.status(404).json({ error: 'Background job not found' });
    }
    if (job.user_id !== req.user.id && !req.user.is_platform_admin) {
      return res.status(403).json({ error: 'Not authorized to inspect this job' });
    }
    res.json({ job });
  } catch (err) {
    next(err);
  }
});

export default router;
