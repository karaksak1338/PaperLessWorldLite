import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
    }),
});

export const ReminderService = {
    requestPermissions: async () => {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        if (existingStatus !== 'granted') {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
        }
        return finalStatus === 'granted';
    },

    scheduleDocumentReminder: async (docId: string, docTitle: string, expiryDate: string | null) => {
        if (!expiryDate) return;

        const triggerDate = new Date(expiryDate);
        if (isNaN(triggerDate.getTime())) return;

        // 90 days before
        const ninetyDaysBefore = new Date(triggerDate);
        ninetyDaysBefore.setDate(ninetyDaysBefore.getDate() - 90);

        // If date is in past or very soon, just schedule for 1 min later for demo/test
        if (ninetyDaysBefore < new Date()) {
            console.log('Reminder date is in the past, scheduling for 1 minute from now for testing.');
            await Notifications.scheduleNotificationAsync({
                content: {
                    title: "Document Alert",
                    body: `${docTitle} verification needed!`,
                    data: { docId },
                },
                trigger: {
                    type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
                    seconds: 60,
                    repeats: false
                },
            });
            return;
        }

        await Notifications.scheduleNotificationAsync({
            content: {
                title: "Document Renewal",
                body: `${docTitle} is up for renewal on ${expiryDate}.`,
                data: { docId },
            },
            trigger: {
                type: Notifications.SchedulableTriggerInputTypes.DATE,
                date: ninetyDaysBefore
            },
        });
    }
};
