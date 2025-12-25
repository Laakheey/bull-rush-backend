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

// NEW: Toggle user active/suspend status
router.put('/users/:userId/status', AdminController.toggleUserStatus);

// GET /api/admin/users/:userId/transactions - Get user transaction history
router.get('/users/:userId/transactions', AdminController.getUserTransactions);
router.get('/stats', AdminController.getDashboardStats);

// routes/admin.routes.ts (add these lines)

router.get('/support/chats', AdminController.getSupportChats);           // List all user conversations
router.get('/support/chat/:userId', AdminController.getUserChatMessages); // Get messages for one user
router.post('/support/reply', AdminController.sendAdminReply);           // Send reply as admin
// router.post('/support/upload', AdminController.uploadChatImage);         // Upload image (returns URL)


export default router;