const express = require('express');
const router = express.Router();
const challengeService = require('../services/challengeService');
const { protect } = require('../middleware/authMiddleware'); // ⭐ LIGNE 4 MODIFIÉE

// Toutes les routes nécessitent l'authentification
router.use(protect); // ⭐ LIGNE 7 MODIFIÉE

/**
 * GET /api/challenges/current
 * Récupère le défi actif avec progression
 */
router.get('/current', async (req, res) => {
  try {
    const challenge = await challengeService.getCurrentChallenge(req.user._id);
    res.json(challenge);
  } catch (error) {
    console.error('Erreur getCurrentChallenge:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/challenges/suggestions
 * Suggestions intelligentes
 */
router.get('/suggestions', async (req, res) => {
  try {
    const suggestions = await challengeService.getSuggestions(req.user._id);
    res.json(suggestions);
  } catch (error) {
    console.error('Erreur getSuggestions:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/challenges
 * Crée un nouveau défi
 */
router.post('/', async (req, res) => {
  try {
    const challenge = await challengeService.createChallenge(
      req.user._id,
      req.body
    );
    res.status(201).json(challenge);
  } catch (error) {
    console.error('Erreur createChallenge:', error);
    
    if (error.message.includes('existe déjà')) {
      return res.status(409).json({ error: error.message });
    }
    
    res.status(400).json({ error: error.message });
  }
});

/**
 * PUT /api/challenges
 * Modifie le défi actuel
 */
router.put('/', async (req, res) => {
  try {
    const challenge = await challengeService.updateChallenge(
      req.user._id,
      req.body
    );
    res.json(challenge);
  } catch (error) {
    console.error('Erreur updateChallenge:', error);
    
    if (error.message.includes('Aucun défi')) {
      return res.status(404).json({ error: error.message });
    }
    
    res.status(400).json({ error: error.message });
  }
});

/**
 * DELETE /api/challenges
 * Supprime le défi actuel
 */
router.delete('/', async (req, res) => {
  try {
    await challengeService.deleteChallenge(req.user._id);
    res.status(204).send();
  } catch (error) {
    console.error('Erreur deleteChallenge:', error);
    
    if (error.message.includes('Aucun défi')) {
      return res.status(404).json({ error: error.message });
    }
    
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;