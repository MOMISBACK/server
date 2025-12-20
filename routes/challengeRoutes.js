// server/routes/challengeRoutes.js

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const challengeService = require('../services/challengeService');

// GET /api/challenges/current
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

// POST /api/challenges
router.post('/', protect, async (req, res) => {
  try {
    console.log('📥 Création challenge:', req.body);
    
    const challenge = await challengeService.createChallenge(req.user.id, req.body);
    
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

// PUT /api/challenges/current
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

// DELETE /api/challenges/current
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

// POST /api/challenges/refresh-progress
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