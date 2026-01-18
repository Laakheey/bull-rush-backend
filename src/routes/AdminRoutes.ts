// routes/admin.routes.ts

import { Router } from 'express';
import { AdminController } from '../controllers/AdminController';
import { adminOnly, clerkMiddleware } from '../middleware/Middleware';
import { supabase } from '../config/supabase';

const router = Router();

router.get('/test', async (req, res) => {
  try {
    const userId = req.auth!.userId;
    console.log('🧪 Testing with user ID:', userId);

    const { data: test1, error: error1 } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    console.log('Test 1 - Single user query:', { test1, error1 });

    const { data: test2, error: error2 } = await supabase
      .from('users')
      .select('*')
      .eq('email', '1906154@ggi.ac.in')
      .single();

    console.log('Test 2 - Email query:', { test2, error2 });

    const { data: test3, error: error3 } = await supabase
      .from('users')
      .select('id, email, is_admin')
      .limit(5);

    console.log('Test 3 - List users:', { test3, error3 });

    res.json({
      userId,
      test1: { data: test1, error: error1?.message },
      test2: { data: test2, error: error2?.message },
      test3: { data: test3, error: error3?.message }
    });
  } catch (error: any) {
    console.error('Test error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.use(clerkMiddleware);
router.use(adminOnly);

router.get('/users', AdminController.getUsers);
router.get('/search', AdminController.searchUsers);

router.put('/users/:userId/balance', AdminController.updateUserBalance);

router.put('/users/:userId/status', AdminController.toggleUserStatus);

router.get('/users/:userId/transactions', AdminController.getUserTransactions);
router.get('/stats', AdminController.getDashboardStats);

router.get('/support/chats', AdminController.getSupportChats);
router.get('/support/chat/:userId', AdminController.getUserChatMessages);
router.post('/support/reply', AdminController.sendAdminReply);

router.get('/earning/stats', AdminController.getAdminStats);

router.put('/users/:userId/updateUserLeaderStatus', AdminController.updateUserLeaderStatus);


export default router;