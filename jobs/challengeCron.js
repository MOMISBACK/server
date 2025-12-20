// server/jobs/challengeCron.js

const cron = require('node-cron');
const WeeklyChallenge = require('../models/WeeklyChallenge');
const User = require('../models/User');

class ChallengeCron {
  
  constructor() {
    // ✅ NEW: Locks pour éviter exécution multiple
    this.locks = new Map();
    
    // ✅ NEW: Stocker les références des jobs pour pouvoir les arrêter
    this.jobs = {
      finalize: null,
      bonus: null,
      cleanupInvitations: null,
      cleanupOldChallenges: null
    };
  }

  // ✅ NEW: Acquérir un lock
  _acquireLock(jobName) {
    if (this.locks.get(jobName)) {
      console.log(`⏭️  [CRON ${jobName}] Déjà en cours, skip...`);
      return false;
    }
    
    this.locks.set(jobName, true);
    console.log(`🔒 [CRON ${jobName}] Lock acquis`);
    return true;
  }

  // ✅ NEW: Libérer un lock
  _releaseLock(jobName) {
    this.locks.delete(jobName);
    console.log(`🔓 [CRON ${jobName}] Lock libéré`);
  }

  // ✅ NEW: Wrapper pour exécuter un job avec lock
  async _runWithLock(jobName, jobFunction) {
    if (!this._acquireLock(jobName)) {
      return; // Job déjà en cours
    }
    
    const startTime = Date.now();
    
    try {
      await jobFunction();
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`✅ [CRON ${jobName}] Terminé en ${duration}s`);
    } catch (error) {
      console.error(`❌ [CRON ${jobName}] Erreur:`, error.message);
      console.error(error.stack);
    } finally {
      this._releaseLock(jobName);
    }
  }

  // ⭐ AMÉLIORÉ : Finaliser les challenges expirés (tous les jours à minuit)
  startDailyFinalizeCron() {
    // Tous les jours à 00:05 (5 min après minuit)
    this.jobs.finalize = cron.schedule('5 0 * * *', async () => {
      await this._runWithLock('FINALIZE', async () => {
        console.log('🕐 [CRON FINALIZE] Vérification des challenges expirés...');
        
        const now = new Date();
        
        // Trouver les challenges expirés non finalisés
        const expiredChallenges = await WeeklyChallenge.find({
          status: { $in: ['active', 'pending'] },
          endDate: { $lt: now }
        }).populate('players.user', 'email');

        console.log(`📋 ${expiredChallenges.length} challenge(s) expiré(s) trouvé(s)`);

        let successCount = 0;
        let errorCount = 0;

        for (const challenge of expiredChallenges) {
          try {
            await this._finalizeChallenge(challenge);
            successCount++;
          } catch (error) {
            console.error(`❌ Erreur finalisation ${challenge._id}:`, error.message);
            errorCount++;
          }
        }

        console.log(`📊 Résultats: ${successCount} succès, ${errorCount} erreurs`);
      });
    });

    console.log('✅ CRON job activé: Finalisation quotidienne à 00:05');
  }

  // ⭐ AMÉLIORÉ : Vérifier les bonus toutes les 5 minutes
  startBonusCheckCron() {
    // Toutes les 5 minutes
    this.jobs.bonus = cron.schedule('*/5 * * * *', async () => {
      await this._runWithLock('BONUS', async () => {
        console.log('🕐 [CRON BONUS] Vérification des bonus...');
        
        // Challenges DUO actifs non finalisés
        const duoChallenges = await WeeklyChallenge.find({
          mode: 'duo',
          status: 'active',
          bonusEarned: true,
          bonusAwarded: false
        }).populate('players.user', 'email totalDiamonds');

        console.log(`🎁 ${duoChallenges.length} bonus potentiel(s) à vérifier`);

        let awardedCount = 0;

        for (const challenge of duoChallenges) {
          try {
            // Double vérification que le bonus est vraiment débloqué
            if (challenge.checkBonus()) {
              await challenge.awardBonus();
              console.log(`🎉 Bonus attribué pour challenge ${challenge._id}`);
              awardedCount++;
            } else {
              console.log(`⚠️ Challenge ${challenge._id}: Bonus non débloqué (condition non remplie)`);
              // Corriger le flag si nécessaire
              if (challenge.bonusEarned) {
                challenge.bonusEarned = false;
                await challenge.save();
              }
            }
          } catch (error) {
            console.error(`❌ Erreur bonus ${challenge._id}:`, error.message);
          }
        }

        if (awardedCount > 0) {
          console.log(`🎊 ${awardedCount} bonus attribué(s)`);
        }
      });
    });

    console.log('✅ CRON job activé: Vérification bonus toutes les 5 min');
  }

  // ✅ NEW: Nettoyer les invitations expirées (tous les jours à 2h)
  startCleanupInvitationsCron() {
    // Tous les jours à 02:00
    this.jobs.cleanupInvitations = cron.schedule('0 2 * * *', async () => {
      await this._runWithLock('CLEANUP_INVITATIONS', async () => {
        console.log('🕐 [CRON CLEANUP] Nettoyage des invitations expirées...');
        
        const expiredDate = new Date();
        expiredDate.setDate(expiredDate.getDate() - 7); // 7 jours

        const result = await WeeklyChallenge.updateMany(
          {
            status: 'pending',
            invitationStatus: 'pending',
            createdAt: { $lt: expiredDate }
          },
          {
            $set: {
              status: 'cancelled',
              invitationStatus: 'expired'
            }
          }
        );

        console.log(`🧹 ${result.modifiedCount} invitation(s) expirée(s) annulée(s)`);
      });
    });

    console.log('✅ CRON job activé: Nettoyage invitations tous les jours à 02:00');
  }

  // ✅ NEW: Supprimer les challenges anciens (tous les jours à 3h)
  startCleanupOldChallengesCron() {
    // Tous les jours à 03:00
    this.jobs.cleanupOldChallenges = cron.schedule('0 3 * * *', async () => {
      await this._runWithLock('CLEANUP_OLD', async () => {
        console.log('🕐 [CRON CLEANUP] Suppression des challenges anciens...');
        
        const oldDate = new Date();
        oldDate.setDate(oldDate.getDate() - 30); // 30 jours

        // Supprimer les challenges annulés/refusés de plus de 30 jours
        const result = await WeeklyChallenge.deleteMany({
          status: { $in: ['cancelled', 'refused'] },
          updatedAt: { $lt: oldDate }
        });

        console.log(`🗑️  ${result.deletedCount} challenge(s) ancien(s) supprimé(s)`);

        // Statistiques optionnelles
        const totalChallenges = await WeeklyChallenge.countDocuments();
        const activeChallenges = await WeeklyChallenge.countDocuments({ status: 'active' });
        const pendingChallenges = await WeeklyChallenge.countDocuments({ status: 'pending' });
        
        console.log(`📊 Stats DB: ${totalChallenges} total, ${activeChallenges} actifs, ${pendingChallenges} pending`);
      });
    });

    console.log('✅ CRON job activé: Nettoyage challenges anciens tous les jours à 03:00');
  }

  // ⭐ AMÉLIORÉ : Helper : finaliser un challenge
  async _finalizeChallenge(challenge) {
    console.log(`🏁 Finalisation challenge ${challenge._id} (mode: ${challenge.mode})...`);
    
    let totalDiamondsAwarded = 0;
    
    // Attribuer les diamants normaux
    for (const player of challenge.players) {
      const playerId = typeof player.user === 'string' ? player.user : player.user._id;
      
      if (player.diamonds > 0) {
        const result = await User.findByIdAndUpdate(
          playerId,
          { $inc: { totalDiamonds: player.diamonds } },
          { new: true }
        );
        
        if (result) {
          console.log(`💎 +${player.diamonds} diamants → ${playerId} (Total: ${result.totalDiamonds})`);
          totalDiamondsAwarded += player.diamonds;
        }
      } else {
        console.log(`⚠️ Joueur ${playerId}: 0 diamants (pas de progression)`);
      }
    }
    
    // Si DUO et bonus non attribué
    if (challenge.mode === 'duo' && !challenge.bonusAwarded) {
      if (challenge.checkBonus()) {
        console.log('🎁 Conditions bonus remplies ! Attribution du doublement...');
        
        // Doubler les diamants (bonus)
        for (const player of challenge.players) {
          const playerId = typeof player.user === 'string' ? player.user : player.user._id;
          
          if (player.diamonds > 0) {
            const result = await User.findByIdAndUpdate(
              playerId,
              { $inc: { totalDiamonds: player.diamonds } },
              { new: true }
            );
            
            if (result) {
              console.log(`🎁 BONUS +${player.diamonds} diamants → ${playerId} (Total: ${result.totalDiamonds})`);
              totalDiamondsAwarded += player.diamonds;
            }
          }
        }
        
        challenge.bonusEarned = true;
        challenge.bonusAwarded = true;
      } else {
        console.log('⚠️ Bonus DUO non débloqué (tous les joueurs doivent compléter)');
        const completionStatus = challenge.players.map((p, i) => `Joueur ${i+1}: ${p.completed ? '✅' : '❌'}`);
        console.log(`   Status: ${completionStatus.join(', ')}`);
      }
    }
    
    challenge.status = 'completed';
    await challenge.save();
    
    console.log(`✅ Challenge ${challenge._id} finalisé - Total diamants: ${totalDiamondsAwarded}`);
  }

  // ⭐ Démarrer tous les CRON jobs
  startAll() {
    console.log('🚀 Démarrage de tous les CRON jobs...');
    
    this.startDailyFinalizeCron();
    this.startBonusCheckCron();
    this.startCleanupInvitationsCron();
    this.startCleanupOldChallengesCron();
    
    console.log('✅ Tous les CRON jobs démarrés avec succès');
  }

  // ✅ NEW: Arrêter tous les CRON jobs (pour shutdown propre)
  stopAll() {
    console.log('🛑 Arrêt de tous les CRON jobs...');
    
    if (this.jobs.finalize) this.jobs.finalize.stop();
    if (this.jobs.bonus) this.jobs.bonus.stop();
    if (this.jobs.cleanupInvitations) this.jobs.cleanupInvitations.stop();
    if (this.jobs.cleanupOldChallenges) this.jobs.cleanupOldChallenges.stop();
    
    // Libérer tous les locks
    this.locks.clear();
    
    console.log('✅ Tous les CRON jobs arrêtés');
  }

  // ✅ NEW: Méthode pour forcer l'exécution manuelle (pour tests)
  async manualFinalize() {
    console.log('🔧 [MANUAL] Exécution manuelle de la finalisation...');
    await this._runWithLock('MANUAL_FINALIZE', async () => {
      const now = new Date();
      const expiredChallenges = await WeeklyChallenge.find({
        status: { $in: ['active', 'pending'] },
        endDate: { $lt: now }
      });
      
      for (const challenge of expiredChallenges) {
        await this._finalizeChallenge(challenge);
      }
    });
  }

  // ✅ NEW: Méthode pour forcer bonus (pour tests)
  async manualBonus() {
    console.log('🔧 [MANUAL] Exécution manuelle des bonus...');
    await this._runWithLock('MANUAL_BONUS', async () => {
      const duoChallenges = await WeeklyChallenge.find({
        mode: 'duo',
        status: 'active',
        bonusEarned: true,
        bonusAwarded: false
      });
      
      for (const challenge of duoChallenges) {
        if (challenge.checkBonus()) {
          await challenge.awardBonus();
        }
      }
    });
  }
}

module.exports = new ChallengeCron();