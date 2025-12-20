// server/routes/challengeRoutes.js

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const challengeService = require('../services/challengeService');

// ✅ GET /api/challenges/current - Récupérer le challenge actif
router.get('/current', protect, async (req, res) => {
  try {
    const challenge = await challengeService.getCurrentChallenge(req.user.id);
    
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

// ✅ GET /api/challenges/invitations - Récupérer les invitations en attente
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

// ✅ POST /api/challenges - Créer un challenge (SOLO ou DUO)
router.post('/', protect, async (req, res) => {
  try {
    const { mode, partnerId, ...challengeData } = req.body;
    
    console.log('📥 Création challenge:', { mode, partnerId, data: challengeData });
    
    let challenge;
    
    if (mode === 'duo') {
      // ✅ Mode DUO : invitation à un partenaire
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
      // ✅ Mode SOLO (par défaut)
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

// ✅ POST /api/challenges/:id/accept - Accepter une invitation
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

// ✅ POST /api/challenges/:id/refuse - Refuser une invitation
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

// ✅ PUT /api/challenges/current - Mettre à jour le challenge actif
router.put('/current', protect, async (req, res) => {
  try {
    const challenge = await challengeService.updateChallenge(req.user.id, req.body);
    
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

// ✅ DELETE /api/challenges/current - Supprimer le challenge actif
router.delete('/current', protect, async (req, res) => {
  try {
    await challengeService.deleteChallenge(req.user.id);
    
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

// ✅ POST /api/challenges/refresh-progress - Recalculer la progression
router.post('/refresh-progress', protect, async (req, res) => {
  try {
    const challenge = await challengeService.calculateProgress(req.user.id);
    
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