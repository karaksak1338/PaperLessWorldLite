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

    scheduleDocumentReminder: async (docId: string, docTitle: string, reminderDate: string | null) => {
        if (!reminderDate) return;

        const triggerDate = new Date(reminderDate);
        if (isNaN(triggerDate.getTime())) return;

        // Ensure we don't schedule for the past
        if (triggerDate < new Date()) {
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
                title: "Document Reminder",
                body: `Reminder: Check ${docTitle} today!`,
                data: { docId },
            },
            trigger: {
                type: Notifications.SchedulableTriggerInputTypes.DATE,
                date: triggerDate
            },
        });
    }
};
