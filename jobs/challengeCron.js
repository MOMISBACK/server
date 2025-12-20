// server/jobs/challengeCron.js

const cron = require('node-cron');
const WeeklyChallenge = require('../models/WeeklyChallenge');
const User = require('../models/User');

class ChallengeCron {
  
  // ⭐ Finaliser les challenges expirés (tous les jours à minuit)
  startDailyFinalizeCron() {
    // Tous les jours à 00:05 (5 min après minuit)
    cron.schedule('5 0 * * *', async () => {
      console.log('🕐 CRON: Vérification des challenges expirés...');
      
      try {
        const now = new Date();
        
        // Trouver les challenges expirés non finalisés
        const expiredChallenges = await WeeklyChallenge.find({
          status: { $in: ['active', 'pending'] },
          endDate: { $lt: now }
        });

        console.log(`📋 ${expiredChallenges.length} challenge(s) expiré(s) trouvé(s)`);

        for (const challenge of expiredChallenges) {
          await this._finalizeChallenge(challenge);
        }

        console.log('✅ CRON: Finalisation terminée');
      } catch (error) {
        console.error('❌ CRON Error:', error);
      }
    });

    console.log('✅ CRON job activé: Finalisation quotidienne à 00:05');
  }

  // ⭐ Vérifier les bonus toutes les 5 minutes
  startBonusCheckCron() {
    // Toutes les 5 minutes
    cron.schedule('*/5 * * * *', async () => {
      console.log('🕐 CRON: Vérification des bonus...');
      
      try {
        // Challenges DUO actifs non finalisés
        const duoChallenges = await WeeklyChallenge.find({
          mode: 'duo',
          status: 'active',
          bonusEarned: true,
          bonusAwarded: false
        });

        console.log(`🎁 ${duoChallenges.length} bonus à attribuer`);

        for (const challenge of duoChallenges) {
          try {
            await challenge.awardBonus();
            console.log(`🎉 Bonus attribué pour challenge ${challenge._id}`);
          } catch (error) {
            console.error(`Erreur bonus ${challenge._id}:`, error);
          }
        }
      } catch (error) {
        console.error('❌ CRON Error bonus:', error);
      }
    });

    console.log('✅ CRON job activé: Vérification bonus toutes les 5 min');
  }

  // ⭐ Helper : finaliser un challenge
  async _finalizeChallenge(challenge) {
    console.log(`🏁 Finalisation challenge ${challenge._id}...`);
    
    // Attribuer les diamants normaux
    for (const player of challenge.players) {
      const playerId = typeof player.user === 'string' ? player.user : player.user._id;
      
      if (player.diamonds > 0) {
        await User.findByIdAndUpdate(
          playerId,
          { $inc: { totalDiamonds: player.diamonds } }
        );
        console.log(`💎 +${player.diamonds} diamants → ${playerId}`);
      }
    }
    
    // Si DUO et bonus non attribué
    if (challenge.mode === 'duo' && !challenge.bonusAwarded) {
      if (challenge.checkBonus()) {
        // Doubler les diamants (bonus)
        for (const player of challenge.players) {
          const playerId = typeof player.user === 'string' ? player.user : player.user._id;
          
          await User.findByIdAndUpdate(
            playerId,
            { $inc: { totalDiamonds: player.diamonds } }  // Encore une fois
          );
          console.log(`🎁 BONUS +${player.diamonds} diamants → ${playerId}`);
        }
        
        challenge.bonusEarned = true;
        challenge.bonusAwarded = true;
      }
    }
    
    challenge.status = 'completed';
    await challenge.save();
    
    console.log(`✅ Challenge ${challenge._id} finalisé`);
  }

  // ⭐ Démarrer tous les CRON jobs
  startAll() {
    this.startDailyFinalizeCron();
    this.startBonusCheckCron();
    console.log('🚀 Tous les CRON jobs démarrés');
  }
}

module.exports = new ChallengeCron();