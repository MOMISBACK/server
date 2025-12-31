// server/controllers/challengeController.js
// Extracted from challengeRoutes.js - consolidates 317 lines of inline logic

const challengeService = require('../services/challengeService');
const { sendSuccess, sendError, sendNotFound, sendCreated, sendServerError } = require('../utils/responseHelper');

/**
 * GET /api/challenges/current
 * Get current challenge for user (optionally filtered by slot)
 */
async function getCurrentChallenge(req, res) {
  try {
    const slot = typeof req.query?.slot === 'string' ? req.query.slot : undefined;
    const challenge = slot
      ? await challengeService.calculateProgress(req.user.id, { slot })
      : await challengeService.getCurrentChallenge(req.user.id);

    if (!challenge) {
      return sendNotFound(res, 'Aucun challenge actif');
    }

    return sendSuccess(res, challenge);
  } catch (error) {
    console.error('Erreur GET /current:', error);
    return sendServerError(res, error);
  }
}

/**
 * GET /api/challenges/invitations
 * Get pending challenge invitations for user
 */
async function getInvitations(req, res) {
  try {
    const invitations = await challengeService.getPendingInvitations(req.user.id);
    return sendSuccess(res, invitations);
  } catch (error) {
    console.error('Erreur GET /invitations:', error);
    return sendServerError(res, error);
  }
}

/**
 * GET /api/challenges/pending-sent
 * Get pending sent DUO invitation by user
 */
async function getPendingSent(req, res) {
  try {
    const slot = typeof req.query?.slot === 'string' ? req.query.slot : undefined;
    const pendingSent = await challengeService.getPendingSentChallenge(req.user.id, slot ? { slot } : undefined);
    return sendSuccess(res, pendingSent);
  } catch (error) {
    console.error('Erreur GET /pending-sent:', error);
    return sendServerError(res, error);
  }
}

/**
 * GET /api/challenges/duo/history
 * Get DUO challenge history between user and partner
 */
async function getDuoHistory(req, res) {
  try {
    const slot = typeof req.query?.slot === 'string' ? req.query.slot : undefined;
    const partnerId = typeof req.query?.partnerId === 'string' ? req.query.partnerId : undefined;
    const history = await challengeService.getDuoChallengeHistory(req.user.id, { slot, partnerId });
    return sendSuccess(res, history);
  } catch (error) {
    console.error('Erreur GET /duo/history:', error);
    return sendError(res, error.message);
  }
}

/**
 * GET /api/challenges/solo/history
 * Get SOLO challenge history for user
 */
async function getSoloHistory(req, res) {
  try {
    const history = await challengeService.getSoloChallengeHistory(req.user.id);
    return sendSuccess(res, history);
  } catch (error) {
    console.error('Erreur GET /solo/history:', error);
    return sendError(res, error.message);
  }
}

/**
 * POST /api/challenges
 * Create a new challenge (solo or duo)
 */
async function createChallenge(req, res) {
  try {
    const { mode, partnerId, ...challengeData } = req.body;

    console.log('📥 Création challenge:', { mode, partnerId, data: challengeData });

    let challenge;

    if (mode === 'duo') {
      if (!partnerId) {
        return sendError(res, 'Un partenaire est requis pour le mode duo');
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

    return sendCreated(res, challenge);
  } catch (error) {
    console.error('❌ Erreur POST /challenges:', error.message);
    return sendError(res, error.message);
  }
}

/**
 * POST /api/challenges/:id/accept
 * Accept a challenge invitation
 */
async function acceptInvitation(req, res) {
  try {
    const challenge = await challengeService.acceptInvitation(req.user.id, req.params.id);

    return res.json({
      success: true,
      data: challenge,
      message: 'Invitation acceptée ! Le challenge commence.',
    });
  } catch (error) {
    console.error('❌ Erreur POST /accept:', error.message);
    return sendError(res, error.message);
  }
}

/**
 * POST /api/challenges/:id/refuse
 * Refuse a challenge invitation
 */
async function refuseInvitation(req, res) {
  try {
    const challenge = await challengeService.refuseInvitation(req.user.id, req.params.id);

    return res.json({
      success: true,
      data: challenge,
      message: 'Invitation refusée.',
    });
  } catch (error) {
    console.error('❌ Erreur POST /refuse:', error.message);
    return sendError(res, error.message);
  }
}

/**
 * POST /api/challenges/:id/sign
 * Sign the current pending DUO proposal (both players must sign before activation)
 */
async function signInvitation(req, res) {
  try {
    const challenge = await challengeService.signInvitation(req.user.id, req.params.id, { allowCreator: true });

    return res.json({
      success: true,
      data: challenge,
      message: challenge?.status === 'active'
        ? 'Pacte signé ! Il commence.'
        : "Signature enregistrée. En attente de l'autre joueur.",
    });
  } catch (error) {
    console.error('❌ Erreur POST /sign:', error.message);
    return sendError(res, error.message);
  }
}

/**
 * PUT /api/challenges/:id/propose
 * Counter-propose (edit) a pending DUO invitation
 */
async function proposeUpdate(req, res) {
  try {
    const challenge = await challengeService.proposeInvitationUpdate(req.user.id, req.params.id, req.body);
    return res.json({
      success: true,
      data: challenge,
      message: 'Contre-proposition envoyée.',
    });
  } catch (error) {
    console.error('❌ Erreur PUT /propose:', error.message);
    return sendError(res, error.message);
  }
}

/**
 * POST /api/challenges/:id/finalize
 * Finalize a completed challenge and distribute diamonds
 */
async function finalizeChallenge(req, res) {
  try {
    const challenge = await challengeService.finalizeChallenge(req.params.id);

    return res.json({
      success: true,
      data: challenge,
      message: 'Challenge finalisé, diamants attribués !',
    });
  } catch (error) {
    console.error('❌ Erreur POST /finalize:', error.message);
    return sendError(res, error.message);
  }
}

/**
 * PUT /api/challenges/current
 * Update current challenge
 */
async function updateCurrentChallenge(req, res) {
  try {
    const slot = typeof req.query?.slot === 'string' ? req.query.slot : undefined;
    const challenge = await challengeService.updateChallenge(req.user.id, req.body, slot ? { slot } : undefined);

    return sendSuccess(res, challenge);
  } catch (error) {
    console.error('Erreur PUT /current:', error);
    return sendError(res, error.message);
  }
}

/**
 * DELETE /api/challenges/current
 * Delete current challenge
 */
async function deleteCurrentChallenge(req, res) {
  try {
    const slot = typeof req.query?.slot === 'string' ? req.query.slot : undefined;
    await challengeService.deleteChallenge(req.user.id, slot ? { slot } : undefined);

    return res.json({
      success: true,
      message: 'Challenge supprimé',
    });
  } catch (error) {
    console.error('Erreur DELETE /current:', error);
    return sendNotFound(res, error.message);
  }
}

/**
 * POST /api/challenges/refresh-progress
 * Refresh progress for current challenge
 */
async function refreshProgress(req, res) {
  try {
    const slot = typeof req.query?.slot === 'string' ? req.query.slot : undefined;
    const challenge = await challengeService.calculateProgress(req.user.id, slot ? { slot } : undefined);

    if (!challenge) {
      return sendNotFound(res, 'Aucun challenge actif');
    }

    return sendSuccess(res, challenge);
  } catch (error) {
    console.error('Erreur refresh-progress:', error);
    return sendServerError(res, error);
  }
}

module.exports = {
  getCurrentChallenge,
  getInvitations,
  getPendingSent,
  getDuoHistory,
  getSoloHistory,
  createChallenge,
  acceptInvitation,
  refuseInvitation,
  signInvitation,
  proposeUpdate,
  finalizeChallenge,
  updateCurrentChallenge,
  deleteCurrentChallenge,
  refreshProgress,
};
