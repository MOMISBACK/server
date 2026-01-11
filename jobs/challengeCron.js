// server/jobs/challengeCron.js

const cron = require('node-cron');
const WeeklyChallenge = require('../models/WeeklyChallenge');
const User = require('../models/User');
const challengeService = require('../services/challengeService');

class ChallengeCron {
  
  constructor() {
    // ✅ NEW: Locks pour éviter exécution multiple
    this.locks = new Map();
    
    // ✅ NEW: Stocker les références des jobs pour pouvoir les arrêter
    this.jobs = {
      finalize: null,
      bonus: null,
      cleanupInvitations: null,
      cleanupOldChallenges: null,
      weeklyRenewal: null // ✅ NEW: Cron pour renouvellement hebdomadaire
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
        }).populate('players.user', 'username email');

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
        }).populate('players.user', 'username email totalDiamonds');

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
    console.log(`🏁 Finalisation challenge ${challenge._id} (mise) (mode: ${challenge.mode})...`);
    // Settlement & payouts are handled in the service.
    await challengeService.finalizeChallenge(challenge._id);
    console.log(`✅ Challenge ${challenge._id} finalisé (mise)`);
  }

  // ⭐ Démarrer tous les CRON jobs
  startAll() {
    console.log('🚀 Démarrage de tous les CRON jobs...');
    
    this.startDailyFinalizeCron();
    this.startBonusCheckCron();
    this.startCleanupInvitationsCron();
    this.startCleanupOldChallengesCron();
    this.startWeeklyRenewalCron(); // ✅ NEW: Renouvellement hebdomadaire
    
    console.log('✅ Tous les CRON jobs démarrés avec succès');
  }

  // ✅ NEW: Arrêter tous les CRON jobs (pour shutdown propre)
  stopAll() {
    console.log('🛑 Arrêt de tous les CRON jobs...');
    
    if (this.jobs.finalize) this.jobs.finalize.stop();
    if (this.jobs.bonus) this.jobs.bonus.stop();
    if (this.jobs.cleanupInvitations) this.jobs.cleanupInvitations.stop();
    if (this.jobs.cleanupOldChallenges) this.jobs.cleanupOldChallenges.stop();
    if (this.jobs.weeklyRenewal) this.jobs.weeklyRenewal.stop();
    
    // Libérer tous les locks
    this.locks.clear();
    
    console.log('✅ Tous les CRON jobs arrêtés');
  }

  // ✅ NEW: Cron pour le renouvellement hebdomadaire (Dimanche minuit → Lundi 00:01)
  startWeeklyRenewalCron() {
    // Run at 00:01 on Monday (just after Sunday midnight)
    // This gives a 1-minute buffer after end of week
    this.jobs.weeklyRenewal = cron.schedule('1 0 * * 1', async () => {
      await this._runWithLock('WEEKLY_RENEWAL', async () => {
        console.log('🔄 [CRON WEEKLY_RENEWAL] Renouvellement hebdomadaire des pactes...');
        
        // Find all challenges that just expired (previous week's Sunday)
        // and have recurrence.enabled = true
        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        
        const expiredChallenges = await WeeklyChallenge.find({
          status: { $in: ['active', 'completed'] },
          endDate: { $gte: oneDayAgo, $lt: now },
          'recurrence.enabled': true
        }).populate('players.user', 'username email totalDiamonds');

        console.log(`📋 ${expiredChallenges.length} challenge(s) à renouveler`);

        let renewedCount = 0;
        let errorCount = 0;

        for (const challenge of expiredChallenges) {
          try {
            // First, finalize the current challenge (settlement)
            if (challenge.status === 'active') {
              await challengeService.finalizeChallenge(challenge._id);
              // Reload to get updated state
              const updated = await WeeklyChallenge.findById(challenge._id);
              if (updated) {
                // Handle recurrence
                const newChallenge = await challengeService._handleRecurrenceIfNeeded(updated);
                if (newChallenge) {
                  console.log(`  ✅ Challenge ${challenge._id} renouvelé → ${newChallenge._id}`);
                  renewedCount++;
                }
              }
            }
          } catch (error) {
            console.error(`  ❌ Erreur renouvellement ${challenge._id}:`, error.message);
            errorCount++;
          }
        }

        console.log(`📊 Résultats renouvellement: ${renewedCount} renouvelé(s), ${errorCount} erreur(s)`);
      });
    });

    console.log('✅ CRON job activé: Renouvellement hebdomadaire (Lundi 00:01)');
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
    console.log('🔧 [MANUAL] Bonus désactivé (mise/settlement géré par le service).');
  }
}

module.exports = new ChallengeCron();