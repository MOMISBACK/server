// server/routes/challengeRoutes.js

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const challengeService = require('../services/challengeService');

// GET /api/challenges/current
router.get('/current', protect, async (req, res) => {
  try {
    const slot = typeof req.query?.slot === 'string' ? req.query.slot : undefined;
    const challenge = slot
      ? await challengeService.calculateProgress(req.user.id, { slot })
      : await challengeService.getCurrentChallenge(req.user.id);
    
    if (!challenge) {
      return res.status(404).json({
        success: false,
        message: 'Aucun challenge actif'
      });
    }

    res.json({
      success: true,
      data: challenge
    });
  } catch (error) {
    console.error('Erreur GET /current:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// GET /api/challenges/invitations
router.get('/invitations', protect, async (req, res) => {
  try {
    const invitations = await challengeService.getPendingInvitations(req.user.id);
    
    res.json({
      success: true,
      data: invitations
    });
  } catch (error) {
    console.error('Erreur GET /invitations:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// GET /api/challenges/pending-sent
// Invitation DUO envoyée par l'utilisateur (en attente)
router.get('/pending-sent', protect, async (req, res) => {
  try {
    const slot = typeof req.query?.slot === 'string' ? req.query.slot : undefined;
    const pendingSent = await challengeService.getPendingSentChallenge(req.user.id, slot ? { slot } : undefined);
    res.json({
      success: true,
      data: pendingSent,
    });
  } catch (error) {
    console.error('Erreur GET /pending-sent:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// GET /api/challenges/duo/history
// Historique des challenges DUO entre l'utilisateur et son partenaire (slot p1/p2)
router.get('/duo/history', protect, async (req, res) => {
  try {
    const slot = typeof req.query?.slot === 'string' ? req.query.slot : undefined;
    const partnerId = typeof req.query?.partnerId === 'string' ? req.query.partnerId : undefined;
    const history = await challengeService.getDuoChallengeHistory(req.user.id, { slot, partnerId });
    res.json({
      success: true,
      data: history,
    });
  } catch (error) {
    console.error('Erreur GET /duo/history:', error);
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

// GET /api/challenges/solo/history
// Historique des challenges SOLO de l'utilisateur
router.get('/solo/history', protect, async (req, res) => {
  try {
    const history = await challengeService.getSoloChallengeHistory(req.user.id);
    res.json({
      success: true,
      data: history,
    });
  } catch (error) {
    console.error('Erreur GET /solo/history:', error);
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

// POST /api/challenges
router.post('/', protect, async (req, res) => {
  try {
    const { mode, partnerId, ...challengeData } = req.body;
    
    console.log('📥 Création challenge:', { mode, partnerId, data: challengeData });
    
    let challenge;
    
    if (mode === 'duo') {
      if (!partnerId) {
        return res.status(400).json({
          success: false,
          message: 'Un partenaire est requis pour le mode duo'
        });
      }
      
      challenge = await challengeService.createDuoChallenge(
        req.user.id,
        partnerId,
        challengeData
      );
    } else {
      challenge = await challengeService.createSoloChallenge(
        req.user.id,
        challengeData
      );
    }
    
    console.log('✅ Challenge créé:', challenge._id);
    
    res.status(201).json({
      success: true,
      data: challenge
    });
  } catch (error) {
    console.error('❌ Erreur POST /challenges:', error.message);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// POST /api/challenges/:id/accept
router.post('/:id/accept', protect, async (req, res) => {
  try {
    const challenge = await challengeService.acceptInvitation(req.user.id, req.params.id);
    
    res.json({
      success: true,
      data: challenge,
      message: 'Invitation acceptée ! Le challenge commence.'
    });
  } catch (error) {
    console.error('❌ Erreur POST /accept:', error.message);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// POST /api/challenges/:id/refuse
router.post('/:id/refuse', protect, async (req, res) => {
  try {
    const challenge = await challengeService.refuseInvitation(req.user.id, req.params.id);
    
    res.json({
      success: true,
      data: challenge,
      message: 'Invitation refusée.'
    });
  } catch (error) {
    console.error('❌ Erreur POST /refuse:', error.message);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// POST /api/challenges/:id/finalize
router.post('/:id/finalize', protect, async (req, res) => {
  try {
    const challenge = await challengeService.finalizeChallenge(req.params.id);
    
    res.json({
      success: true,
      data: challenge,
      message: 'Challenge finalisé, diamants attribués !'
    });
  } catch (error) {
    console.error('❌ Erreur POST /finalize:', error.message);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// PUT /api/challenges/current
router.put('/current', protect, async (req, res) => {
  try {
    const slot = typeof req.query?.slot === 'string' ? req.query.slot : undefined;
    const challenge = await challengeService.updateChallenge(req.user.id, req.body, slot ? { slot } : undefined);
    
    res.json({
      success: true,
      data: challenge
    });
  } catch (error) {
    console.error('Erreur PUT /current:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// DELETE /api/challenges/current
router.delete('/current', protect, async (req, res) => {
  try {
    const slot = typeof req.query?.slot === 'string' ? req.query.slot : undefined;
    await challengeService.deleteChallenge(req.user.id, slot ? { slot } : undefined);
    
    res.json({
      success: true,
      message: 'Challenge supprimé'
    });
  } catch (error) {
    console.error('Erreur DELETE /current:', error);
    res.status(404).json({
      success: false,
      message: error.message
    });
  }
});

// POST /api/challenges/refresh-progress
router.post('/refresh-progress', protect, async (req, res) => {
  try {
    const slot = typeof req.query?.slot === 'string' ? req.query.slot : undefined;
    const challenge = await challengeService.calculateProgress(req.user.id, slot ? { slot } : undefined);
    
    if (!challenge) {
      return res.status(404).json({
        success: false,
        message: 'Aucun challenge actif'
      });
    }

    res.json({
      success: true,
      data: challenge
    });
  } catch (error) {
    console.error('Erreur refresh-progress:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;