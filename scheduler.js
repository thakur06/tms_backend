const cron = require('node-cron');
const { checkAndNotifyLowHours } = require('./controllers/notificationsController');

const initScheduler = () => {
  console.log('⏰ Scheduler initialized');

  // Schedule task to run every Monday at 10:00 AM
  // Cron format: Minute Hour DayOfMonth Month DayOfWeek
  cron.schedule('0 10 * * 1', async () => {
    console.log('Running weekly hours check job...');
    try {
      const result = await checkAndNotifyLowHours();
      console.log(`Weekly hours check completed. Emails sent: ${result.notifications.length}`);
    } catch (error) {
      console.error('Error running weekly hours check job:', error);
    }
  });
};

module.exports = initScheduler;
